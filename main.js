const { app, BrowserWindow, ipcMain, clipboard, Menu, session, dialog, shell, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const vm = require('vm');

// ============================================================
// UPDATE CONFIGURATION (manual only)
// ============================================================
const DOWNLOAD_TIMEOUT_MS = 20 * 1000;   // abort a download after 20s
const DOWNLOAD_RETRIES    = 3;           // retry attempts per file
const RETRY_DELAY_MS      = 2000;

let isUpdating = false;

const UPDATE_MANIFEST = [
    {
        localPath: path.join(__dirname, 'main.js'),
        remoteUrl: 'https://raw.githubusercontent.com/otqmerking/finder/main/main.js',
        backupPath: path.join(__dirname, 'main.js.backup'),
        validator: (buf) =>
            buf.length > 500 &&
            !/^\s*<(!doctype|html)/i.test(buf.toString('utf8', 0, 200))
    },
    {
        localPath: path.join(__dirname, 'notify', 'notify.js'),
        remoteUrl: 'https://raw.githubusercontent.com/otqmerking/finder/main/notify.js',
        backupPath: path.join(__dirname, 'notify', 'notify.js.backup'),
        ensureDirectory: true,
        validator: (buf) =>
            buf.length > 100 &&
            !/^\s*<(!doctype|html)/i.test(buf.toString('utf8', 0, 200))
    }
];

// ============================================================
// NOTIFICATION MODULE (dynamic)
// ============================================================
let notificationModule = {
    checkForNewOrders: () => {},
    showNewOrderNotification: () => {}
};

function loadNotificationModule() {
    try {
        if (fs.existsSync(path.join(__dirname, 'notify.js'))) {
            delete require.cache[require.resolve('./notify.js')];
            notificationModule = require('./notify.js');
            console.log('Notification module loaded successfully');
        } else {
            console.log('Notifications are currently disabled');
        }
    } catch (err) {
        console.warn('Notification module error:', err.message);
    }
}

app.commandLine.appendSwitch('disable-features', 'CookiesWithoutSameSiteMustBeSecure');

let mainWindow;
let tray = null;
let findWindow = null;

// ============================================================
// MAIN WINDOW
// ============================================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        fullscreen: true,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        },
    });

    session.defaultSession.clearCache();
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: Object.assign(
                {
                    'Cache-Control': ['no-store', 'no-cache', 'must-revalidate', 'proxy-revalidate'],
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
                details.responseHeaders
            ),
        });
    });

    mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/login.php');

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });

    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.destroy();
        app.quit();
    });

    ipcMain.on('copy-to-clipboard', (event, text) => {
        clipboard.writeText(text);
    });

    ipcMain.on('find-text', (event, text) => {
        if (mainWindow && text.trim() !== '') {
            mainWindow.webContents.findInPage(text);
        }
    });

    ipcMain.on('close-find', () => {
        if (findWindow) {
            findWindow.close();
            findWindow = null;
        }
        if (mainWindow) {
            mainWindow.webContents.stopFindInPage('clearSelection');
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F4' && input.type === 'keyDown') app.quit();
        else if (input.key === 'Escape' && input.type === 'keyDown') mainWindow.minimize();
        else if (input.key === 'F2' && input.type === 'keyDown') mainWindow.webContents.goBack();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.endsWith('.pdf')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }

        const newWindow = new BrowserWindow({
            width: 800,
            height: 600,
            frame: false,
            webPreferences: {
                contextIsolation: true,
                enableRemoteModule: false,
                nodeIntegration: false,
            },
        });

        newWindow.loadURL(url);
        return { action: 'allow' };
    });

    // Background order polling
    setInterval(() => {
        if (fs.existsSync(path.join(__dirname, 'notify.js'))) {
            try {
                notificationModule.checkForNewOrders(mainWindow);
            } catch (err) {
                console.warn('Order check failed:', err.message);
            }
        }
    }, 5000);
}

// ============================================================
// FIND WINDOW
// ============================================================
function openFindWindow() {
    if (findWindow) {
        findWindow.focus();
        return;
    }

    findWindow = new BrowserWindow({
        parent: mainWindow,
        modal: false,
        width: 400,
        height: 120,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        movable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    findWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    margin: 0; 
                    font-family: Arial, sans-serif; 
                    background: #2c3e50;
                    display: flex;
                    flex-direction: column;
                    -webkit-app-region: drag;
                    height: 100vh;
                    overflow: hidden;
                }
                .search-container {
                    display: flex;
                    padding: 10px;
                    align-items: center;
                    -webkit-app-region: no-drag;
                }
                input { 
                    flex: 1;
                    height: 36px;
                    padding: 8px 12px;
                    font-size: 14px;
                    border: 1px solid #3498db;
                    border-radius: 4px;
                    margin-right: 10px;
                    background: #ecf0f1;
                    box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
                }
                input:focus {
                    outline: none;
                    border-color: #2980b9;
                    box-shadow: 0 0 5px rgba(52, 152, 219, 0.5);
                }
                .close-btn {
                    width: 36px;
                    height: 36px;
                    background: #e74c3c;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                }
                .close-btn:hover {
                    background: #c0392b;
                }
                .hint {
                    padding: 0 10px;
                    font-size: 11px;
                    color: #bdc3c7;
                    -webkit-app-region: no-drag;
                    margin-top: 5px;
                }
                .title-bar {
                    height: 24px;
                    background: #34495e;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    padding: 0 5px;
                    -webkit-app-region: drag;
                    border-top-left-radius: 5px;
                    border-top-right-radius: 5px;
                }
                .title-text {
                    flex: 1;
                    text-align: center;
                    color: #ecf0f1;
                    font-size: 12px;
                    padding-left: 30px;
                }
            </style>
        </head>
        <body>
            <div class="title-bar">
                <div class="title-text">Search</div>
            </div>
            <div class="search-container">
                <input id="findInput" type="text" placeholder="Type to search..." autofocus />
                <button class="close-btn" id="closeBtn" title="Close">X</button>
            </div>
            <div class="hint">Press Enter to search, Escape to close • Drag from top to move</div>
            <script>
                const { ipcRenderer } = require('electron');
                const input = document.getElementById('findInput');
                const closeBtn = document.getElementById('closeBtn');

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        ipcRenderer.send('find-text', input.value);
                    } else if (e.key === 'Escape') {
                        ipcRenderer.send('close-find');
                    }
                });
                
                closeBtn.addEventListener('click', () => {
                    ipcRenderer.send('close-find');
                });
                
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 100);
            </script>
        </body>
        </html>
    `));

    findWindow.on('closed', () => {
        findWindow = null;
    });

    findWindow.setOpacity(0.98);
}

// ============================================================
// NOTIFY TOGGLE
// ============================================================
function isNotifyEnabled() {
    return fs.existsSync(path.join(__dirname, 'notify.js'));
}

function toggleNotifications() {
    const sourcePath = path.join(__dirname, 'notify', 'notify.js');
    const destPath = path.join(__dirname, 'notify.js');

    if (isNotifyEnabled()) {
        try {
            try { delete require.cache[require.resolve('./notify.js')]; } catch {}
            fs.unlinkSync(destPath);
            console.log('Notifications disabled - notify.js removed');
        } catch (err) {
            console.error('Error removing notify.js:', err);
            dialog.showErrorBox('Error', 'Failed to disable notifications: ' + err.message);
            return;
        }
    } else {
        try {
            if (!fs.existsSync(sourcePath)) {
                throw new Error('Source notify.js not found in notify folder');
            }
            fs.copyFileSync(sourcePath, destPath);
            console.log('Notifications enabled - notify.js copied');
        } catch (err) {
            console.error('Error copying notify.js:', err);
            dialog.showErrorBox('Error', 'Failed to enable notifications: ' + err.message);
            return;
        }
    }

    app.relaunch();
    app.exit();
}

// ============================================================
// UPDATE HELPERS
// ============================================================
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) return resolve(null);
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', d => hash.update(d));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * HTTPS GET -> Buffer, with timeout + redirect handling.
 */
function httpsGetBuffer(url, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Finder-AutoUpdater/1.0',
                'Cache-Control': 'no-cache'
            },
            timeout: DOWNLOAD_TIMEOUT_MS
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
                return httpsGetBuffer(res.headers.location, redirectsLeft - 1)
                    .then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }

            const chunks = [];
            let received = 0;
            const expected = parseInt(res.headers['content-length'] || '0', 10);

            res.on('data', (chunk) => {
                chunks.push(chunk);
                received += chunk.length;
            });

            res.on('end', () => {
                if (expected && received !== expected) {
                    return reject(new Error(
                        `Incomplete download: got ${received}/${expected} bytes`
                    ));
                }
                resolve(Buffer.concat(chunks));
            });

            res.on('error', reject);
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
        });
        req.on('error', reject);
    });
}

async function downloadFileWithRetry(url, validator) {
    let lastErr;
    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
        try {
            const buf = await httpsGetBuffer(url);
            if (validator && !validator(buf)) {
                throw new Error('Downloaded content failed validation (wrong format / HTML error page)');
            }
            return buf;
        } catch (err) {
            lastErr = err;
            console.warn(`Download attempt ${attempt}/${DOWNLOAD_RETRIES} failed for ${url}: ${err.message}`);
            if (attempt < DOWNLOAD_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }
        }
    }
    throw lastErr || new Error('Download failed');
}

/** Atomic write: .tmp -> fsync -> rename. */
function atomicWriteFileSync(targetPath, buffer) {
    const tmp = targetPath + '.tmp-' + process.pid + '-' + Date.now();
    const fd = fs.openSync(tmp, 'w');
    try {
        fs.writeSync(fd, buffer, 0, buffer.length, 0);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(tmp, targetPath);
}

/** Syntax check so we never install a broken main.js. */
function syntaxCheck(buffer, filename) {
    try {
        new vm.Script(buffer.toString('utf8'), { filename });
        return true;
    } catch (err) {
        console.error(`Syntax check failed for ${filename}: ${err.message}`);
        return false;
    }
}

/** Cleanup leftover backups + .tmp files (runs at startup). */
function cleanupBackups() {
    for (const file of UPDATE_MANIFEST) {
        try {
            if (fs.existsSync(file.backupPath)) {
                fs.unlinkSync(file.backupPath);
                console.log(`Cleaned up old backup: ${path.basename(file.backupPath)}`);
            }
        } catch (err) {
            console.warn(`Could not remove backup ${file.backupPath}:`, err.message);
        }
        try {
            const dir = path.dirname(file.localPath);
            const base = path.basename(file.localPath);
            for (const entry of fs.readdirSync(dir)) {
                if (entry.startsWith(base + '.tmp-')) {
                    try { fs.unlinkSync(path.join(dir, entry)); } catch {}
                }
            }
        } catch {}
    }
}

// ============================================================
// MANUAL UPDATE FLOW (triggered by user only)
// ============================================================
async function runManualUpdate() {
    if (isUpdating) {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update in progress',
            message: 'An update check is already running. Please wait.',
            buttons: ['OK']
        });
        return;
    }

    isUpdating = true;

    // Show a non-blocking "checking" box — user sees feedback
    // (we don't await it; it closes when we show the final dialog)
    if (mainWindow) {
        mainWindow.webContents.send('update-status', 'checking');
    }

    try {
        const pending = [];

        for (const file of UPDATE_MANIFEST) {
            try {
                if (file.ensureDirectory) {
                    const dir = path.dirname(file.localPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                }

                const currentHash = await calculateFileHash(file.localPath);
                const remoteBuf = await downloadFileWithRetry(file.remoteUrl, file.validator);
                const remoteHash = crypto.createHash('sha256').update(remoteBuf).digest('hex');

                if (currentHash === remoteHash) {
                    console.log(`No update needed for ${path.basename(file.localPath)}`);
                    continue;
                }

                if (!syntaxCheck(remoteBuf, file.localPath)) {
                    console.error(`Refusing to apply ${path.basename(file.localPath)}: syntax error in remote file`);
                    continue;
                }

                console.log(`Update available for ${path.basename(file.localPath)}`);
                pending.push({ file, remoteBuf });
            } catch (err) {
                console.error(`Error preparing update for ${path.basename(file.localPath)}:`, err.message);
            }
        }

        if (pending.length === 0) {
            await dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'No Updates',
                message: 'You are already running the latest version.',
                buttons: ['OK']
            });
            return;
        }

        // Apply
        let successCount = 0;

        for (const { file, remoteBuf } of pending) {
            try {
                if (fs.existsSync(file.localPath)) {
                    fs.copyFileSync(file.localPath, file.backupPath);
                }
                atomicWriteFileSync(file.localPath, remoteBuf);
                successCount++;
                console.log(`Updated: ${path.basename(file.localPath)}`);
            } catch (err) {
                console.error(`Error applying update for ${path.basename(file.localPath)}:`, err.message);
                if (fs.existsSync(file.backupPath)) {
                    try {
                        fs.copyFileSync(file.backupPath, file.localPath);
                        console.log(`Restored backup for ${path.basename(file.localPath)}`);
                    } catch (re) {
                        console.error(`Failed to restore backup:`, re.message);
                    }
                }
            }
        }

        if (successCount === 0) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Update Failed',
                message: 'Updates were found but none could be applied. Check the console for details.',
                buttons: ['OK']
            });
            return;
        }

        // Save state before restart
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                await mainWindow.webContents.executeJavaScript(`
                    try {
                        localStorage.setItem('app_last_state', JSON.stringify({
                            url: window.location.href,
                            timestamp: Date.now()
                        }));
                    } catch (e) {}
                `);
            } catch (e) {
                console.error('Error saving state before restart:', e.message);
            }
        }

        // Tell user and let them restart — this is the only behavioural change
        // from the auto-update version: user confirms restart.
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: `Update downloaded (${successCount} file${successCount === 1 ? '' : 's'}). Restart now to apply?`,
            buttons: ['Restart Now', 'Later'],
            defaultId: 0,
            cancelId: 1
        });

        if (response === 0) {
            app.relaunch();
            app.exit(0);
        } else {
            console.log('User deferred restart. New files are on disk; will apply on next launch.');
        }

    } catch (err) {
        console.error('Update check failed:', err);
        dialog.showErrorBox('Update Error', 'Update failed: ' + err.message);
    } finally {
        isUpdating = false;
    }
}

// ============================================================
// MENU
// ============================================================
function createMenu() {
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: '🏠 Home',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/index.php')
                },
                { role: 'quit', label: '🚪 Exit' },
                {
                    label: '🔒 Sign out',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/logout.php')
                },
            ]
        },
        {
            label: 'Services',
            submenu: [
                {
                    label: '🧰 Tech',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/tech/tech.html')
                },
                {
                    label: '📦 Stock Manager',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/stock/admin.php')
                },
                {
                    label: '📭 No Inventory',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/noinvo.php')
                },
                {
                    label: '🛒 Orders',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/order/notifications.php')
                },
                {
                    label: '📚 Catalogs',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/pdf/pdf.php')
                },
                {
                    label: '⚙️ Consumption',
                    submenu: [
                        {
                            label: '📊 Analytics',
                            click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/consumption/consumption.html')
                        },
                        {
                            label: '🕒 History',
                            click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/history.html')
                        }
                    ]
                },
                {
                    label: '🎬 Media',
                    submenu: [
                        {
                            label: '📹 Videos',
                            click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/video.php')
                        },
                        {
                            label: '🧊 Models',
                            click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/model.php')
                        }
                    ]
                },
                {
                    label: '🚚 Supplier',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/supplier.php')
                }
            ]
        },
        {
            label: 'Developer',
            submenu: [
                {
                    label: '👨‍💻 Developer',
                    click: () => mainWindow.loadURL('http://apt-ot-740v5f4.aptiv.com/Finder/resources/app/cv.pdf')
                },
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: '🔍 Find',
                    accelerator: 'Alt+F',
                    click: () => openFindWindow()
                },
                { role: 'forceReload', label: '🔄 Reload' },
                { role: 'resetZoom', label: '🖼️ Actual Size' },
                { role: 'zoomIn', label: '➕ Zoom In' },
                { role: 'zoomOut', label: '➖ Zoom Out' },
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: '🔄 Check for Updates',
                    click: () => runManualUpdate()
                },
                {
                    id: 'toggle-notifications',
                    label: isNotifyEnabled() ? '🔕 Notify Off' : '🔔 Notify On',
                    click: () => toggleNotifications()
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// ============================================================
// APP LIFECYCLE
// ============================================================
app.on('ready', () => {
    loadNotificationModule();
    createWindow();
    createMenu();

    // Only cleanup is automatic — the actual check is user-driven
    cleanupBackups();

    console.log('Manual update mode — updates only run when user clicks Help → Check for Updates');

    try {
        tray = new Tray(path.join(__dirname, 'icon.ico'));
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show App', click: () => mainWindow.show() },
            { label: 'Check for Updates', click: () => runManualUpdate() },
            { label: 'Quit', click: () => app.quit() }
        ]);
        tray.setToolTip('Stock Keeper');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
    } catch (err) {
        console.error('Tray icon initialization failed:', err);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
    if (mainWindow) mainWindow.destroy();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// ============================================================
// IPC
// ============================================================
ipcMain.on('order-notification', (event, notification) => {
    try {
        const { Notification } = require('electron');
        new Notification({ title: 'Order Notification', body: notification }).show();
    } catch (err) {
        console.error('Failed to show notification:', err);
    }
});

ipcMain.on('app-state-request', (event) => {
    if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
            const savedState = localStorage.getItem('app_last_state');
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    if (state.url && Date.now() - state.timestamp < 5000) {
                        window.location.href = state.url;
                        localStorage.removeItem('app_last_state');
                    }
                } catch(e) {}
            }
        `).catch(err => console.error('Error restoring state:', err));
    }
});
