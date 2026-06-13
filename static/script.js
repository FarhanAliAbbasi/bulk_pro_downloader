// Global state variables
let linksList = [];
let downloadSessionId = null;
let eventSource = null;

// DOM Elements
const el = {
    inputSingleLink: document.getElementById('input-single-link'),
    btnAddLink: document.getElementById('btn-add-link'),

    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    selectedFileName: document.getElementById('selected-file-name'),
    actionBar: document.getElementById('action-bar'),
    linksCountBadge: document.getElementById('links-count-badge'),
    badgeFilename: document.getElementById('badge-filename'),
    btnDownloadAll: document.getElementById('btn-download-all'),

    selectCookieFile: document.getElementById('select-cookie-file'),
    btnRefreshCookies: document.getElementById('btn-refresh-cookies'),
    inputDownloadFolder: document.getElementById('input-download-folder'),

    queueStatus: document.getElementById('queue-status'),
    linksTable: document.getElementById('links-table'),
    linksTbody: document.getElementById('links-tbody'),

    activeProgressCard: document.getElementById('active-progress-card'),
    activeVideoName: document.getElementById('active-video-name'),
    activePercent: document.getElementById('active-progress-percent'),
    activeProgressBar: document.getElementById('active-progress-bar'),
    activeSpeed: document.getElementById('active-speed'),
    activeEta: document.getElementById('active-eta'),

    terminalOutput: document.getElementById('terminal-output'),
    btnClearLogs: document.getElementById('btn-clear-logs'),

    galleryGrid: document.getElementById('gallery-grid'),
    btnRefreshGallery: document.getElementById('btn-refresh-gallery'),

    // Video Modal
    videoModal: document.getElementById('video-modal'),
    modalVideoPlayer: document.getElementById('modal-video-player'),
    modalVideoTitle: document.getElementById('modal-video-title'),
    modalVideoSize: document.getElementById('modal-video-size'),
    modalVideoDate: document.getElementById('modal-video-date'),
    btnCloseModal: document.getElementById('btn-close-modal'),

    // System status indicator
    headerStatus: document.querySelector('.header-status'),
    statusIndicator: document.querySelector('.status-indicator'),
    statusLabel: document.querySelector('.status-label')
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    loadCookiesList();
    loadVideosGallery();
    setupDropzone();
    setupEventListeners();
    addRandomStars();
});

// BACKGROUND NEBULA DECORATION
function addRandomStars() {
    const starsContainer = document.querySelector('.stars-container');
    if (!starsContainer) return;

    // Generate subtle sparkles dynamically
    for (let i = 0; i < 40; i++) {
        const star = document.createElement('div');
        star.style.position = 'absolute';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = Math.random() * 2 + 1 + 'px';
        star.style.height = star.style.width;
        star.style.background = '#fff';
        star.style.opacity = Math.random() * 0.4 + 0.1;
        star.style.borderRadius = '50%';
        star.style.boxShadow = '0 0 4px #fff';
        // Add soft blinking animation
        star.style.animation = `blink ${Math.random() * 3 + 2}s infinite alternate`;
        starsContainer.appendChild(star);
    }
}

// SETUP FILE DRAG & DROP
function setupDropzone() {
    el.dropzone.addEventListener('click', () => el.fileInput.click());

    el.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });

    el.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropzone.classList.add('dragover');
    });

    el.dropzone.addEventListener('dragleave', () => {
        el.dropzone.classList.remove('dragover');
    });

    el.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });
}

// HANDLE FILE ANALYSIS & PARSING
async function handleUploadedFile(file) {
    if (!file.name.endsWith('.txt')) {
        logToConsole('[ERROR] Only plain text (.txt) files are supported.', 'failed');
        alert('Please upload a valid .txt file containing TikTok links.');
        return;
    }

    el.selectedFileName.textContent = `Selected: ${file.name}`;
    logToConsole(`[SYSTEM] Reading file: "${file.name}"...`, 'system');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/parse-links', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to parse file.');
        }

        const data = await response.json();

        if (data.valid_count === 0) {
            logToConsole(`[WARNING] No valid links detected in ${file.name}.`, 'failed');
            alert('No valid video links found in the text file.');
            return;
        }

        linksList = data.links;

        // Show summary action bar
        el.linksCountBadge.textContent = `${data.valid_count} Links Found`;
        el.badgeFilename.textContent = file.name;
        el.actionBar.classList.remove('hidden');

        // Populate download queue table
        renderQueueTable(linksList);

        el.queueStatus.textContent = `${data.valid_count} Videos Queued`;
        el.queueStatus.className = 'badge';

        logToConsole(`[SUCCESS] Loaded ${data.valid_count} TikTok links into download queue! Ready to download.`, 'success');

    } catch (err) {
        logToConsole(`[ERROR] File processing failed: ${err.message}`, 'failed');
        alert(`Error processing file: ${err.message}`);
    }
}

// RENDER QUEUE TABLE ITEMS
function renderQueueTable(links) {
    el.linksTbody.innerHTML = '';

    links.forEach((link, idx) => {
        const row = document.createElement('tr');
        row.id = `queue-row-${idx}`;

        // Extract display name or part of url
        const cleanUrl = link.split('?')[0];
        const displayUrl = cleanUrl.replace('https://', '').replace('www.', '');

        row.innerHTML = `
            <td>${idx + 1}</td>
            <td class="video-url" title="${link}">${displayUrl}</td>
            <td>
                <span class="status-pill pending" id="status-pill-${idx}">
                    <i class="far fa-clock"></i> Pending
                </span>
            </td>
        `;
        el.linksTbody.appendChild(row);
    });
}

// ADD A SINGLE LINK TO THE DOWNLOAD QUEUE (ONE-BY-ONE)
function addSingleLinkToQueue() {
    const rawLink = el.inputSingleLink.value.trim();
    if (!rawLink) return;

    // Check if it's a valid TikTok video URL
    const isTikTok = rawLink.includes('tiktok.com/');
    if (!isTikTok) {
        alert('Please paste a valid TikTok video URL.');
        return;
    }

    // Normalize/clean the link by stripping trailing parameters
    const cleanLink = rawLink.split('?')[0].trim();

    // Check if the link is already in our linksList (prevent duplicates)
    if (linksList.includes(cleanLink) || linksList.some(link => link.split('?')[0].trim() === cleanLink)) {
        alert('This link is already in the download queue.');
        return;
    }

    // If it's the first link, clear any placeholder/empty states in the table
    if (linksList.length === 0) {
        el.linksTbody.innerHTML = '';
    }

    linksList.push(rawLink);

    // Update Badge
    el.linksCountBadge.textContent = `${linksList.length} Links Found`;
    el.badgeFilename.textContent = "Custom List";
    el.actionBar.classList.remove('hidden');

    // Render Queue Table
    renderQueueTable(linksList);

    el.queueStatus.textContent = `${linksList.length} Videos Queued`;
    el.queueStatus.className = 'badge';

    logToConsole(`[SUCCESS] Added link to queue: ${cleanLink}`, 'success');

    // Clear input field
    el.inputSingleLink.value = '';
}

// SETUP EVENT LISTENERS
function setupEventListeners() {
    // One-by-one link event listeners
    el.btnAddLink.addEventListener('click', addSingleLinkToQueue);
    el.inputSingleLink.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addSingleLinkToQueue();
        }
    });

    el.btnDownloadAll.addEventListener('click', startBulkDownload);
    el.btnRefreshCookies.addEventListener('click', loadCookiesList);
    el.btnClearLogs.addEventListener('click', () => {
        el.terminalOutput.innerHTML = '<div class="log-line log-system">[SYSTEM] Console logs cleared.</div>';
    });
    el.btnRefreshGallery.addEventListener('click', loadVideosGallery);

    // Video Modal close handlers
    el.btnCloseModal.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === el.videoModal || e.target.classList.contains('video-modal-backdrop')) {
            closeModal();
        }
    });
}

// LOAD LIST OF COOKIES FROM SERVER
async function loadCookiesList() {
    try {
        el.btnRefreshCookies.querySelector('i').classList.add('fa-spin');
        const response = await fetch('/api/cookies');
        const data = await response.json();

        el.selectCookieFile.innerHTML = '<option value="">No cookies (Default)</option>';
        data.cookies_files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            if (file === data.default) {
                option.selected = true;
            }
            el.selectCookieFile.appendChild(option);
        });
        logToConsole('[SYSTEM] Workspace cookie files scanned successfully.', 'system');
    } catch (err) {
        logToConsole('[ERROR] Failed to fetch cookie files.', 'failed');
    } finally {
        setTimeout(() => {
            el.btnRefreshCookies.querySelector('i').classList.remove('fa-spin');
        }, 600);
    }
}

// WRITE LOGS TO THE CONSOLE
function logToConsole(message, type = 'system') {
    const log = document.createElement('div');
    log.className = `log-line log-${type}`;
    log.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el.terminalOutput.appendChild(log);

    // Auto-scroll terminal
    el.terminalOutput.scrollTop = el.terminalOutput.scrollHeight;
}

// START BULK DOWNLOAD PIPELINE (SSE STREAMING)
async function startBulkDownload() {
    if (linksList.length === 0) return;

    // Check if downloading already to prevent overlapping streams
    if (downloadSessionId) {
        alert("A download session is currently active.");
        return;
    }

    const cookiesFile = el.selectCookieFile.value;
    const downloadFolder = el.inputDownloadFolder.value.trim() || 'tiktok_videos';

    logToConsole(`[SYSTEM] Initializing download request for ${linksList.length} links...`, 'system');

    // Update global status indicator to Downloading
    el.statusIndicator.className = 'status-indicator downloading';
    el.statusLabel.textContent = 'Downloading...';

    // Disable download triggers
    el.btnDownloadAll.disabled = true;
    el.btnDownloadAll.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading Queue...';

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                links: linksList,
                cookies_file: cookiesFile,
                download_folder: downloadFolder
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to start download queue.');
        }

        const session = await response.json();
        downloadSessionId = session.session_id;

        // Open SSE connection
        setupSSEStream(downloadSessionId);

    } catch (err) {
        logToConsole(`[ERROR] Download initialization failed: ${err.message}`, 'failed');
        resetDownloadTriggerState();
    }
}

// ESTABLISH SERVER-SENT EVENTS CONNECTION
function setupSSEStream(sessionId) {
    eventSource = new EventSource(`/api/download/stream/${sessionId}`);

    eventSource.onmessage = (event) => {
        const item = JSON.parse(event.data);

        switch (item.type) {
            case 'start_video':
                // Focus row and set badge to Downloading
                updateRowStatus(item.index, 'downloading', '<i class="fas fa-spinner fa-spin"></i> Active');
                logToConsole(`[START] [Video ${item.index + 1}/${linksList.length}] Initiating download for: ${item.link}`, 'start');

                // Show/Update active progress card
                el.activeProgressCard.classList.remove('hidden');
                el.activeVideoName.textContent = item.link;
                updateProgressCard('0%', '0 MB/s', '0s', 0);
                break;

            case 'progress':
                // Update active progress details
                updateProgressCard(item.percent, item.speed, item.eta, item.downloaded_bytes);
                break;

            case 'finished_video':
                logToConsole(`[FINISHED] Locally rendered file: ${item.filename}`, 'progress');
                break;

            case 'success_video':
                const isSkipped = item.message && item.message.includes('Skipped');
                const statusHtml = isSkipped ? '<i class="fas fa-check-circle"></i> Skipped' : '<i class="fas fa-check-circle"></i> Completed';
                updateRowStatus(item.index, 'success', statusHtml);
                const msg = item.message || 'Video downloaded perfectly.';
                logToConsole(`[SUCCESS] [Video ${item.index + 1}/${linksList.length}] ${msg}`, 'success');
                break;

            case 'failed_video':
                updateRowStatus(item.index, 'failed', '<i class="fas fa-times-circle"></i> Failed');
                logToConsole(`[FAILED] [Video ${item.index + 1}/${linksList.length}] Error details: ${item.error}`, 'failed');
                break;

            case 'done':
                logToConsole(`[SUCCESS] Bulk download pipeline completed successfully!`, 'success');
                closeSSEConnection();
                loadVideosGallery(); // Refresh files
                break;

            case 'ping':
                // Just server ping
                break;

            case 'error':
                logToConsole(`[ERROR] Stream error: ${item.message}`, 'failed');
                closeSSEConnection();
                break;
        }
    };

    eventSource.onerror = (e) => {
        logToConsole('[ERROR] Lost connection with bulk downloader thread.', 'failed');
        closeSSEConnection();
    };
}

// UPDATE SPECIFIC ROW IN QUEUE TABLE
function updateRowStatus(index, state, htmlContent) {
    const row = document.getElementById(`queue-row-${index}`);
    const pill = document.getElementById(`status-pill-${index}`);

    if (pill) {
        pill.className = `status-pill ${state}`;
        pill.innerHTML = htmlContent;
    }

    if (row && state === 'downloading') {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// UPDATE ACTIVE PROGRESS GRAPH CARD
function updateProgressCard(percent, speed, eta, bytes) {
    el.activePercent.textContent = percent;
    el.activeSpeed.textContent = speed;
    el.activeEta.textContent = eta;

    // Extract decimal value out of percentage string (e.g. '42.5%' -> 42.5)
    const pctValue = parseFloat(percent.replace('%', '')) || 0;
    el.activeProgressBar.style.width = `${pctValue}%`;
}

// CLOSE SSE CONNECTION & RE-ENABLE TRIGGERS
function closeSSEConnection() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    downloadSessionId = null;
    resetDownloadTriggerState();
}

function resetDownloadTriggerState() {
    el.statusIndicator.className = 'status-indicator online';
    el.statusLabel.textContent = 'System Active';

    el.btnDownloadAll.disabled = false;
    el.btnDownloadAll.innerHTML = '<i class="fas fa-download"></i> Start Bulk Download';

    el.activeProgressCard.classList.add('hidden');
}

// LOAD DOWNLOADED VIDEOS GALLERY
async function loadVideosGallery() {
    const downloadFolder = el.inputDownloadFolder.value.trim() || 'tiktok_videos';

    try {
        const response = await fetch(`/api/videos?folder=${encodeURIComponent(downloadFolder)}`);
        const data = await response.json();

        // Update live aggregate download stats in the gallery header
        const totalVideosEl = document.getElementById('stat-total-videos');
        const totalSizeEl = document.getElementById('stat-total-size');
        const allTimeSizeEl = document.getElementById('stat-all-time-size');
        if (totalVideosEl) totalVideosEl.textContent = data.total_count !== undefined ? data.total_count : data.videos.length;
        if (totalSizeEl) totalSizeEl.textContent = data.total_data_usage || '0 Bytes';
        if (allTimeSizeEl) allTimeSizeEl.textContent = data.all_time_network_usage || '0 Bytes';

        el.galleryGrid.innerHTML = '';

        if (data.videos.length === 0) {
            el.galleryGrid.innerHTML = `
                <div class="gallery-empty-state">
                    <i class="fas fa-video-slash"></i>
                    <p>No downloaded TikTok videos found in "${downloadFolder}".</p>
                </div>
            `;
            return;
        }

        data.videos.forEach(video => {
            const card = document.createElement('div');
            card.className = 'video-card animate-fade-in';

            // Clean up name for presentation (use display_name if available to hide subfolder prefixes)
            const cleanTitle = (video.display_name || video.filename).replace(/\.mp4|\.webm/g, '').replace(/_/g, ' ');

            // Set dynamic platform icon (strictly TikTok-centric)
            let platformIcon = '<i class="fab fa-tiktok"></i>';

            card.innerHTML = `
                <div class="video-card-thumbnail">
                    <span class="thumbnail-icon">${platformIcon}</span>
                    <div class="play-hover-overlay">
                        <span class="btn-play-action"><i class="fas fa-play"></i></span>
                    </div>
                </div>
                <div class="video-card-details">
                    <div class="video-card-title" title="${video.filename}">${cleanTitle}</div>
                    <div class="video-card-meta">
                        <span><i class="fas fa-hdd"></i> ${video.size}</span>
                        <span><i class="fas fa-calendar-alt"></i> ${video.created.split(' ')[0]}</span>
                    </div>
                </div>
                <div class="video-card-actions">
                    <button class="btn btn-secondary btn-play" data-file="${video.filename}" data-size="${video.size}" data-date="${video.created}">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <button class="btn btn-delete btn-remove-video" data-file="${video.filename}">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            `;

            // Add click listeners to playing buttons
            card.querySelector('.video-card-thumbnail').addEventListener('click', () => {
                openVideoPlayer(video.filename, cleanTitle, video.size, video.created);
            });
            card.querySelector('.btn-play').addEventListener('click', () => {
                openVideoPlayer(video.filename, cleanTitle, video.size, video.created);
            });

            // Delete handler
            card.querySelector('.btn-remove-video').addEventListener('click', () => {
                deleteVideoFromServer(video.filename);
            });

            el.galleryGrid.appendChild(card);
        });

    } catch (err) {
        logToConsole('[ERROR] Failed to load videos gallery.', 'failed');
    }
}

// DELETE VIDEO FILE FROM HOST STORAGE
async function deleteVideoFromServer(filename) {
    if (!confirm(`Are you sure you want to delete this video file?\n"${filename}"`)) {
        return;
    }

    const downloadFolder = el.inputDownloadFolder.value.trim() || 'tiktok_videos';

    try {
        const response = await fetch(`/api/videos/delete/${encodeURIComponent(filename)}?folder=${encodeURIComponent(downloadFolder)}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            logToConsole(`[SYSTEM] Deleted file: ${filename}`, 'system');
            loadVideosGallery(); // Refresh cards list
        } else {
            alert(`Failed to delete: ${data.error}`);
        }
    } catch (err) {
        alert(`Error deleting video: ${err.message}`);
    }
}

// STREAM VIDEO INSIDE HTML5 DIALOG MODAL
function openVideoPlayer(filename, title, size, date) {
    const downloadFolder = el.inputDownloadFolder.value.trim() || 'tiktok_videos';
    const videoUrl = `/videos/${encodeURIComponent(filename)}?folder=${encodeURIComponent(downloadFolder)}`;

    el.modalVideoPlayer.src = videoUrl;
    el.modalVideoTitle.textContent = title;
    el.modalVideoSize.innerHTML = `<i class="fas fa-hdd"></i> ${size}`;
    el.modalVideoDate.innerHTML = `<i class="fas fa-calendar-alt"></i> ${date}`;

    el.videoModal.classList.add('active');
    el.modalVideoPlayer.load();
    el.modalVideoPlayer.play().catch(e => {
        // Safe play failure
    });
}

function closeModal() {
    el.videoModal.classList.remove('active');
    el.modalVideoPlayer.pause();
    el.modalVideoPlayer.src = '';
}
