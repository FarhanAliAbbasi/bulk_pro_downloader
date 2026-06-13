# 🎥 TikTok Bulk Pro

[![Python Version](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)
[![Framework](https://img.shields.io/badge/framework-Flask-red.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

A high-performance, automated bulk video downloader for TikTok featuring a premium dark-themed glassmorphic Web Dashboard. The application prioritizes high-speed, watermark-free streams with fallback protocols and persistent statistics tracking.

---

## 🌟 Key Features

* **💎 Watermark-Free Downloads**: Automatically pulls raw, watermark-free (and bookmark-free) video streams using the high-speed TikWM API.
* **⚡ Resilient Fallback Mechanics**: Automatic failover to `yt-dlp` using your session cookies to guarantee download success even under rate limits.
* **📈 Persistent All-Time Network Logger**: Tracks overall data consumption in `data_usage.txt`. The total network traffic value remains preserved even if local files are deleted.
* **🍪 Live Cookie Switcher**: Scan and hot-swap different Netscape-formatted cookie files (e.g., `cookies.txt`) directly from the browser UI settings panel.
* **💻 Interactive Console & Playback**:
  * Real-time progress updates, network transfer speeds, and ETA calculations streamed via Server-Sent Events (SSE).
  * Seamless HTML5 video gallery with inline modal playback.
  * Direct one-click local file deletion controls.

---

## 📂 Project Structure

```text
├── app.py                      # Flask Application Backend & Worker Threads
├── cookies.txt                 # Optional Netscape cookies list
├── data_usage.txt              # Persistent tracker file for network usage (bytes)
├── failed_links.txt            # Real-time logger for failed link records
├── run_downloader.bat         # Windows double-click shortcut launcher
├── templates/
│   └── index.html              # HTML5 Glassmorphic structure
└── static/
    ├── script.js               # Event-handling, SSE stream logic & UI rendering
    └── style.css               # Dark-mode styling, glowing orbs & animations
```

---

## 🚀 Quick Start

### 1. Prerequisites
Make sure you have [Python 3.8+](https://www.python.org/downloads/) installed.

### 2. Installation
Clone this repository and navigate to the project directory:
```bash
git clone https://github.com/your-username/tiktok-bulk-downloader.git
cd tiktok-bulk-downloader
```

Install the dependencies:
```bash
pip install flask yt-dlp requests
```

### 3. Session Authentication (Optional but Recommended)
To prevent rate limits or bypass verification challenges on TikTok, export your account cookies in Netscape format (using browser extensions like *Get cookies.txt LOCALLY*) and save the file as `cookies.txt` in the root folder.

### 4. Running the Dashboard
Run the Flask server:
```bash
python app.py
```
Or simply double-click the **`run_downloader.bat`** file if you are on Windows.

Once running, open your web browser and navigate to:
👉 **`http://localhost:5000`**

---

## 📖 How to Use

### Direct Paste Ingest
Paste any TikTok link directly into the **Upload & Download Links** panel and click **Add to Queue**.

### Bulk Batch Import
1. Create a plain `.txt` file containing your TikTok video links (one URL per line).
2. Drag and drop the `.txt` file onto the upload dropzone or select it via browse.
3. Review your parsed queue, adjust your active cookie file or download folder, and click **Start Bulk Download**.

---

## 🛠️ Built With

* [Flask](https://flask.palletsprojects.com/) - Python micro-framework
* [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Media metadata parser
* [TikWM API](https://tikwm.com/) - Watermark-free stream delivery
* Vanilla JS, HTML5, CSS3

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [LICENSE](#license) for more information.
