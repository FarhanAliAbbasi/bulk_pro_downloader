import os
import queue
import threading
import json
import mimetypes
import time
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
import yt_dlp

app = Flask(__name__)

# Base configuration
DEFAULT_DOWNLOAD_FOLDER = "tiktok_videos"
DEFAULT_COOKIE_FILE = "cookies.txt"

# Thread-safe queue list and state dictionary for active download sessions
# To prevent multiple overlapping downloads, we'll keep track of active sessions
active_sessions = {}

def get_cookie_files():
    """Find all text files in the workspace that could be cookies."""
    files = []
    for f in os.listdir('.'):
        if f.endswith('.txt') and ('cookie' in f.lower() or f == 'cookies.txt'):
            files.append(f)
    if not files and os.path.exists(DEFAULT_COOKIE_FILE):
        files.append(DEFAULT_COOKIE_FILE)
    return sorted(list(set(files)))

def get_all_time_data_usage():
    """Retrieve the persistent all-time data usage in bytes."""
    usage_file = "data_usage.txt"
    if os.path.exists(usage_file):
        try:
            with open(usage_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                return int(content) if content.isdigit() else 0
        except Exception:
            return 0
    return 0

def add_to_all_time_data_usage(bytes_count):
    """Add bytes to the persistent all-time data usage."""
    usage_file = "data_usage.txt"
    current = get_all_time_data_usage()
    new_total = current + bytes_count
    try:
        with open(usage_file, 'w', encoding='utf-8') as f:
            f.write(str(new_total))
    except Exception as e:
        print(f"[ERROR] Saving all-time data usage: {str(e)}")

def format_size(bytes_size):
    """Format bytes to human readable format."""
    if not bytes_size:
        return "0 Bytes"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} TB"

def download_via_fallback_api(clean_link, download_folder, progress_callback):
    """Fallback TikTok downloader using TikWM API."""
    import requests
    try:
        api_url = "https://www.tikwm.com/api/"
        response = requests.post(api_url, data={'url': clean_link}, timeout=15)
        response.raise_for_status()
        res_data = response.json()
        
        if res_data.get('code') != 0:
            raise Exception(res_data.get('msg', 'API returned non-zero code'))
            
        data = res_data.get('data', {})
        play_url = data.get('play')
        if not play_url:
            raise Exception("No direct MP4 URL found in API response")
            
        # Extract title and ID
        title = data.get('title', 'video')
        # Clean title for safe local filename
        clean_title = "".join([c for c in title if c.isalnum() or c in ' -_']).strip()[:100]
        if not clean_title:
            clean_title = "video"
            
        video_id = data.get('id', '')
        if not video_id:
            if '/video/' in clean_link:
                video_id = clean_link.split('/video/')[-1].split('/')[0].strip()
            elif '/photo/' in clean_link:
                video_id = clean_link.split('/photo/')[-1].split('/')[0].strip()
        
        filename = f"{clean_title}_{video_id}.mp4"
        filepath = os.path.join(download_folder, filename)
        
        # Download the direct play stream
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://www.tiktok.com/'
        }
        
        stream_res = requests.get(play_url, headers=headers, stream=True, timeout=30)
        stream_res.raise_for_status()
        
        total_size = int(stream_res.headers.get('content-length', 0))
        downloaded = 0
        
        # Track start time to calculate transfer speed
        start_time = time.time()
        
        # Write file in chunks and trigger progress callbacks
        with open(filepath, 'wb') as f:
            for chunk in stream_res.iter_content(chunk_size=1024 * 64):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback and total_size > 0:
                        elapsed = time.time() - start_time
                        speed = downloaded / elapsed if elapsed > 0 else 0
                        progress_callback(downloaded, total_size, speed)
                        
        return filepath
    except Exception as e:
        raise Exception(f"TikWM Fallback API error: {str(e)}")

def update_failed_links_file(link, was_successful):
    """Manage the failed_links.txt file in real time.
    If was_successful is True: remove link from file if present.
    If was_successful is False: append link to file if not already present.
    """
    failed_file = "failed_links.txt"
    clean_link = link.split('?')[0].strip()
    if not clean_link:
        return
        
    lines = []
    if os.path.exists(failed_file):
        try:
            with open(failed_file, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
        except Exception as e:
            print(f"[ERROR] Reading failed_links.txt: {str(e)}")
            
    normalized_lines = [l.split('?')[0].strip() for l in lines]
    
    if was_successful:
        new_lines = []
        for line in lines:
            if line.split('?')[0].strip() != clean_link:
                new_lines.append(line)
        if len(new_lines) != len(lines):
            try:
                with open(failed_file, 'w', encoding='utf-8') as f:
                    for line in new_lines:
                        f.write(f"{line}\n")
                print(f"[SYSTEM] Cleaned successful link from failed_links.txt: {clean_link}")
            except Exception as e:
                print(f"[ERROR] Writing failed_links.txt: {str(e)}")
    else:
        if clean_link not in normalized_lines:
            try:
                with open(failed_file, 'a', encoding='utf-8') as f:
                    f.write(f"{link}\n")
                print(f"[SYSTEM] Logged failed link to failed_links.txt: {clean_link}")
            except Exception as e:
                print(f"[ERROR] Logging to failed_links.txt: {str(e)}")

def download_thread_worker(links, q, cookies_file, download_folder):
    """Worker function executing the yt-dlp download in a separate thread."""
    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            
            if total > 0:
                percent = f"{(downloaded / total) * 100:.1f}%"
            else:
                percent = d.get('_percent_str', '0.0%').strip()
            
            speed_val = d.get('speed')
            if speed_val:
                speed = f"{speed_val / 1024 / 1024:.2f} MB/s"
            else:
                speed = d.get('_speed_str', 'N/A').strip()
                
            eta_val = d.get('eta')
            if eta_val:
                eta = f"{eta_val}s"
            else:
                eta = d.get('_eta_str', 'N/A').strip()

            q.put({
                'type': 'progress',
                'percent': percent,
                'speed': speed,
                'eta': eta,
                'downloaded_bytes': downloaded,
                'total_bytes': total
            })
        elif d['status'] == 'finished':
            q.put({
                'type': 'finished_video',
                'filename': os.path.basename(d.get('filename', ''))
            })

    os.makedirs(download_folder, exist_ok=True)
    
    for index, raw_link in enumerate(links):
        clean_link = raw_link.strip().split('?')[0].strip()
            
        if not clean_link or 'tiktok.com' not in clean_link:
            continue

        q.put({
            'type': 'start_video',
            'index': index,
            'link': clean_link
        })
        
        active_folder = os.path.join(download_folder, "tiktok")
        os.makedirs(active_folder, exist_ok=True)
        
        # Duplicate check: check if file with matching video ID already exists in download_folder or active subfolder
        video_id = None
        if '/video/' in clean_link:
            video_id = clean_link.split('/video/')[-1].split('/')[0].strip()
        elif '/photo/' in clean_link:
            video_id = clean_link.split('/photo/')[-1].split('/')[0].strip()
        
        already_downloaded = False
        if video_id:
            check_dirs = [download_folder, active_folder]
            for check_dir in check_dirs:
                if os.path.exists(check_dir):
                    for f in os.listdir(check_dir):
                        if f.endswith(f'_{video_id}.mp4') or f'_{video_id}.' in f:
                            already_downloaded = True
                            break
                if already_downloaded:
                    break
        
        if already_downloaded:
            q.put({
                'type': 'success_video',
                'index': index,
                'message': 'Already downloaded previously! (Skipped)'
            })
            update_failed_links_file(clean_link, was_successful=True)
            continue

        # Localized options for yt-dlp download
        ydl_opts = {
            'outtmpl': f'{active_folder}/%(title)s_%(id)s.%(ext)s', 
            'quiet': True,
            'no_warnings': True,
            'format': 'play/download/best[vcodec*=h264]/best',
            'progress_hooks': [progress_hook],
        }
        if cookies_file and os.path.exists(cookies_file):
            ydl_opts['cookiefile'] = cookies_file

        # Try TikWM API first to guarantee watermark-free (no bookmark) download
        try:
            def progress_callback(downloaded, total_size, speed_val):
                percent = f"{(downloaded / total_size) * 100:.1f}%"
                speed_str = f"{speed_val / 1024 / 1024:.2f} MB/s" if speed_val > 0 else "Calculating..."
                
                if speed_val > 0:
                    eta_secs = int((total_size - downloaded) / speed_val)
                    eta_str = f"{eta_secs}s"
                else:
                    eta_str = "Calculating..."
                    
                q.put({
                    'type': 'progress',
                    'percent': percent,
                    'speed': speed_str,
                    'eta': eta_str,
                    'downloaded_bytes': downloaded,
                    'total_bytes': total_size
                })
            
            filepath = download_via_fallback_api(clean_link, active_folder, progress_callback)
            
            q.put({
                'type': 'finished_video',
                'filename': os.path.basename(filepath)
            })
            
            q.put({
                'type': 'success_video',
                'index': index,
                'message': 'TikTok video downloaded watermark-free.'
            })
            update_failed_links_file(clean_link, was_successful=True)
            
            try:
                add_to_all_time_data_usage(os.path.getsize(filepath))
            except Exception:
                pass
        except Exception as tikwm_err:
            print(f"[SYSTEM] TikWM API failed: {str(tikwm_err)}. Falling back to yt-dlp...")
            # Fallback to yt-dlp
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([clean_link])
                q.put({
                    'type': 'success_video',
                    'index': index,
                    'message': 'TikTok downloaded via yt-dlp fallback (may contain watermark).'
                })
                update_failed_links_file(clean_link, was_successful=True)
                
                try:
                    if video_id:
                        for f in os.listdir(active_folder):
                            if f.endswith(f'_{video_id}.mp4') or f'_{video_id}.' in f:
                                filepath = os.path.join(active_folder, f)
                                add_to_all_time_data_usage(os.path.getsize(filepath))
                                break
                except Exception:
                    pass
            except Exception as ytdlp_err:
                q.put({
                    'type': 'failed_video',
                    'index': index,
                    'error': f"TikWM error: {str(tikwm_err)} | yt-dlp error: {str(ytdlp_err)}"
                })
                update_failed_links_file(raw_link, was_successful=False)
        
        # Short sleep between downloads to mimic human behavior
        if index < len(links) - 1:
            time.sleep(2)

    q.put({'type': 'done'})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/cookies', methods=['GET'])
def list_cookies():
    return jsonify({
        'cookies_files': get_cookie_files(),
        'default': DEFAULT_COOKIE_FILE if os.path.exists(DEFAULT_COOKIE_FILE) else (get_cookie_files()[0] if get_cookie_files() else '')
    })

@app.route('/api/parse-links', methods=['POST'])
def parse_links():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
        
    if file:
        content = file.read().decode('utf-8', errors='ignore')
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        
        # Simple validation & cleansing
        parsed_links = []
        for line in lines:
            if 'tiktok.com' in line:
                parsed_links.append(line)
                
        return jsonify({
            'filename': file.filename,
            'total_count': len(lines),
            'valid_count': len(parsed_links),
            'links': parsed_links
        })

@app.route('/api/videos', methods=['GET'])
def list_videos():
    folder = request.args.get('folder', DEFAULT_DOWNLOAD_FOLDER)
    if not os.path.exists(folder):
        return jsonify({
            'videos': [],
            'total_count': 0,
            'total_data_usage': '0 Bytes',
            'total_data_bytes': 0,
            'all_time_network_usage': format_size(get_all_time_data_usage()),
            'all_time_network_bytes': get_all_time_data_usage()
        })
        
    videos = []
    # Walk the download folder recursively to scan main folder and all subfolders
    for root, dirs, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(('.mp4', '.webm', '.mkv', '.mov')):
                path = os.path.join(root, f)
                stat = os.stat(path)
                
                # Get the relative filename to support subfolders (e.g. 'tiktok/video.mp4')
                rel_path = os.path.relpath(path, folder).replace('\\', '/')
                
                videos.append({
                    'filename': rel_path,
                    'display_name': f,
                    'size': format_size(stat.st_size),
                    'size_bytes': stat.st_size,
                    'created': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_ctime)),
                    'created_raw': stat.st_ctime
                })
            
    # Sort by creation time, descending (newest first)
    videos.sort(key=lambda x: x['created_raw'], reverse=True)
    
    # Calculate all-time aggregate stats
    total_bytes = sum(v['size_bytes'] for v in videos)
    
    return jsonify({
        'videos': videos,
        'total_count': len(videos),
        'total_data_usage': format_size(total_bytes),
        'total_data_bytes': total_bytes,
        'all_time_network_usage': format_size(get_all_time_data_usage()),
        'all_time_network_bytes': get_all_time_data_usage()
    })

@app.route('/videos/<path:filename>')
def serve_video(filename):
    folder = request.args.get('folder', DEFAULT_DOWNLOAD_FOLDER)
    return send_from_directory(os.path.abspath(folder), filename)

@app.route('/api/videos/delete/<path:filename>', methods=['POST'])
def delete_video(filename):
    folder = request.args.get('folder', DEFAULT_DOWNLOAD_FOLDER)
    path = os.path.join(folder, filename)
    if os.path.exists(path):
        try:
            os.remove(path)
            return jsonify({'success': True, 'message': f'Deleted {filename}'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    return jsonify({'success': False, 'error': 'File not found'}), 404

@app.route('/api/download', methods=['POST'])
def start_download():
    data = request.json or {}
    links = data.get('links', [])
    cookies_file = data.get('cookies_file', DEFAULT_COOKIE_FILE)
    download_folder = data.get('download_folder', DEFAULT_DOWNLOAD_FOLDER)

    if not links:
        return jsonify({'error': 'No links provided'}), 400

    q = queue.Queue()
    # Create thread to handle downloading asynchronously
    t = threading.Thread(
        target=download_thread_worker, 
        args=(links, q, cookies_file, download_folder),
        daemon=True
    )
    t.start()

    # Store queue in active sessions with a dynamic ID
    session_id = str(time.time())
    active_sessions[session_id] = q

    return jsonify({
        'success': True,
        'session_id': session_id,
        'total_links': len(links)
    })

@app.route('/api/download/stream/<session_id>', methods=['GET'])
def stream_download(session_id):
    q = active_sessions.get(session_id)
    if not q:
        return jsonify({'error': 'Invalid or expired session ID'}), 404

    def event_generator():
        while True:
            try:
                # Keepalive ping or poll queue
                item = q.get(timeout=30)
                yield f"data: {json.dumps(item)}\n\n"
                
                if item.get('type') == 'done':
                    # Clean up session
                    active_sessions.pop(session_id, None)
                    break
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'ping', 'message': 'still downloading'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break

    return Response(event_generator(), mimetype='text/event-stream')

if __name__ == '__main__':
    # Creating templates and static dirs if not exist
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    
    print("Starting TikTok Bulk Downloader Server...")
    print("Open http://localhost:5000 in your browser")
    app.run(host='0.0.0.0', port=5000, debug=True)
