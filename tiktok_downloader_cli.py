import yt_dlp
import os
import time

def bulk_download_tiktok():
    input_file = "links.txt"
    failed_file = "failed_links.txt"
    download_folder = "tiktok_videos"
    
    if not os.path.exists(input_file):
        print(f"Error: Please create a '{input_file}' file and paste your links inside.")
        return
        
    with open(input_file, "r") as f:
        links = [line.strip() for line in f if line.strip()]

    if not links:
        print(f"The '{input_file}' file is empty.")
        return

    failed_links = []
    os.makedirs(download_folder, exist_ok=True)
    print(f"Created/found folder: '{download_folder}'.\n")
    
    ydl_opts = {
        'outtmpl': f'{download_folder}/%(title)s_%(id)s.%(ext)s', 
        'quiet': True,
        'no_warnings': True,
        'cookiefile': 'cookies.txt', 
        # Changed back to standard 'chrome' now that the dependencies are properly linked
        'impersonate': 'chrome',
    }
    
    print(f"Starting download of {len(links)} videos (One by one)...\n")
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for index, raw_link in enumerate(links, 1):
            clean_link = raw_link.split('?')[0]
            
            print(f"[{index}/{len(links)}] Downloading: {clean_link}")
            try:
                ydl.download([clean_link])
                print("  -> ✅ Success")
            except Exception:
                print("  -> ❌ Failed")
                failed_links.append(raw_link)
            
            if index < len(links):
                time.sleep(2)
                
    if failed_links:
        with open(failed_file, "w") as f:
            for link in failed_links:
                f.write(link + "\n")
        print(f"\nFinished! {len(failed_links)} links failed. Checked '{failed_file}'.")
    else:
        print(f"\nSuccess! All videos downloaded perfectly into the '{download_folder}' folder.")

if __name__ == "__main__":
    bulk_download_tiktok()