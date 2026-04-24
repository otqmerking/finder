const { app, BrowserWindow, ipcMain, clipboard, Menu, session, dialog, shell, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

// Auto-update configuration
const AUTO_UPDATE_INTERVAL = 30000; // Check every 30 seconds
let updateCheckInterval = null;
let isUpdating = false;

// Notification module with dynamic loading
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

    // Session and cache configuration
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

    // Load main URL
    mainWindow.loadURL('https://dlbsxk8q3.aptiva.com/Finder/resources/app/login.php');

    // Security handling
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });

    // Window event handlers
    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.destroy();
        app.quit();
    });

    // IPC handlers
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

    // Keyboard shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F4' && input.type === 'keyDown') app.quit();
        else if (input.key === 'Escape' && input.type === 'keyDown') mainWindow.minimize();
        else if (input.key === 'F2' && input.type === 'keyDown') mainWindow.webContents.goBack();
    });

    // New window handling
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

    // Start background processes
    setInterval(() => {
        if (fs.existsSync(path.join(__dirname, 'notify.js'))) {
            notificationModule.checkForNewOrders(mainWindow);
        }
    }, 5000);
}

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

function isNotifyEnabled() {
    return fs.existsSync(path.join(__dirname, 'notify.js'));
}

function toggleNotifications() {
    const sourcePath = path.join(__dirname, 'notify', 'notify.js');
    const destPath = path.join(__dirname, 'notify.js');
    
    if (isNotifyEnabled()) {
        try {
            fs.unlinkSync(destPath);
            console.log('Notifications disabled - notify.js removed');
        } catch (err) {
            console.error('Error removing notify.js:', err);
            dialog.showErrorBox('Error', 'Failed to disable notifications');
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
            dialog.showErrorBox('Error', 'Failed to enable notifications');
            return;
        }
    }
    
    app.relaunch();
    app.exit();
}

// Calculate file hash for version checking
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            resolve(null);
            return;
        }
        
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Silent auto-update function
async function checkAndUpdateSilently() {
    if (isUpdating) {
        console.log('Update already in progress, skipping...');
        return;
    }
    
    const filesToUpdate = [
        {
            localPath: path.join(__dirname, 'main.js'),
            remoteUrl: 'https://raw.githubusercontent.com/otqmerking/finder/main/main.js',
            backupPath: path.join(__dirname, 'main.js.backup')
        },
        {
            localPath: path.join(__dirname, 'notify', 'notify.js'),
            remoteUrl: 'https://raw.githubusercontent.com/otqmerking/finder/main/notify.js',
            ensureDirectory: true,
            backupPath: path.join(__dirname, 'notify', 'notify.js.backup')
        }
    ];
    
    let hasUpdates = false;
    let updates = [];
    
    // Check for updates
    for (const file of filesToUpdate) {
        try {
            // Create directory if needed
            if (file.ensureDirectory) {
                const dir = path.dirname(file.localPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }
            
            // Get current file hash if exists
            const currentHash = await calculateFileHash(file.localPath);
            
            // Download remote file to temp location
            const tempPath = file.localPath + '.temp';
            await downloadFile(file.remoteUrl, tempPath);
            
            // Calculate remote file hash
            const remoteHash = await calculateFileHash(tempPath);
            
            // Compare hashes
            if (currentHash !== remoteHash) {
                hasUpdates = true;
                updates.push({
                    ...file,
                    tempPath,
                    remoteHash
                });
                console.log(`Update available for ${path.basename(file.localPath)}`);
            } else {
                // Remove temp file if no update
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                console.log(`No update needed for ${path.basename(file.localPath)}`);
            }
        } catch (err) {
            console.error(`Error checking update for ${path.basename(file.localPath)}:`, err.message);
        }
    }
    
    // Apply updates if available
    if (hasUpdates) {
        isUpdating = true;
        console.log('Updates detected, applying silently...');
        
        let successCount = 0;
        
        for (const update of updates) {
            try {
                // Create backup of current file
                if (fs.existsSync(update.localPath)) {
                    fs.copyFileSync(update.localPath, update.backupPath);
                }
                
                // Replace with new file
                fs.copyFileSync(update.tempPath, update.localPath);
                
                // Remove temp file
                fs.unlinkSync(update.tempPath);
                
                successCount++;
                console.log(`Updated: ${path.basename(update.localPath)}`);
            } catch (err) {
                console.error(`Error applying update for ${path.basename(update.localPath)}:`, err.message);
                
                // Restore from backup if update failed
                if (fs.existsSync(update.backupPath)) {
                    try {
                        fs.copyFileSync(update.backupPath, update.localPath);
                        console.log(`Restored backup for ${path.basename(update.localPath)}`);
                    } catch (restoreErr) {
                        console.error(`Failed to restore backup:`, restoreErr.message);
                    }
                }
            }
        }
        
        // Clean up backup files
        setTimeout(() => {
            for (const update of updates) {
                try {
                    if (fs.existsSync(update.backupPath)) {
                        fs.unlinkSync(update.backupPath);
                    }
                } catch (err) {
                    console.error(`Error removing backup:`, err.message);
                }
            }
        }, 5000);
        
        // Restart app if any updates were successful
        if (successCount > 0) {
            console.log(`Applied ${successCount} update(s). Restarting app in 2 seconds...`);
            
            // Save current state if needed
            if (mainWindow) {
                mainWindow.webContents.executeJavaScript(`
                    localStorage.setItem('app_last_state', JSON.stringify({
                        url: window.location.href,
                        timestamp: Date.now()
                    }));
                `).catch(err => console.error('Error saving state:', err));
            }
            
            setTimeout(() => {
                app.relaunch();
                app.exit();
            }, 2000);
        } else {
            isUpdating = false;
        }
    }
}

// Helper function to download a file
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
                file.on('error', reject);
            } else {
                file.close();
                fs.unlink(destPath, () => {});
                reject(new Error(`HTTP ${response.statusCode}`));
            }
        }).on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// Start auto-update checker
function startAutoUpdateChecker() {
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
    }
    
    // Initial check after 10 seconds
    setTimeout(() => {
        checkAndUpdateSilently();
    }, 10000);
    
    // Periodic checks
    updateCheckInterval = setInterval(() => {
        checkAndUpdateSilently();
    }, AUTO_UPDATE_INTERVAL);
}

function createMenu() {
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: '🏠 Home',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/index.php')
                },
                { role: 'quit', label: '🚪 Exit' },
                {
                    label: '🔒 Sign out',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/logout.php')
                },
            ]
        },
        {
            label: 'Services',
            submenu: [
                {
                    label: '🧰 Tech',
                    click: () => mainWindow.loadURL('http://dlbsxk8q3.aptiv.com/Finder/resources/app/tech/tech.html')
                },
                {
                    label: '📦 Stock Manager',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/stock/admin.php')
                },
                {
                    label: '📭 No Inventory',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/noinvo.php')
                },
                {
                    label: '🛒 Orders',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/order/notifications.php')
                },
                {
                    label: '📚 Catalogs',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/pdf/pdf.php')
                },
                {
                    label: '⚙️ Consumption',
                    submenu: [
                        {
                            label: '📊 Analytics',
                            click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/consumption/consumption.html')
                        },
                        {
                            label: '🕒 History',
                            click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/history.html')
                        }
                    ]
                },
                {
                    label: '🎬 Media',
                    submenu: [
                        {
                            label: '📹 Videos',
                            click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/video.php')
                        },
                        {
                            label: '🧊 Models',
                            click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/model.php')
                        }
                    ]
                },
                {
                    label: '🚚 Supplier',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/supplier.php')
                }
            ]
        },
        {
            label: 'Developer',
            submenu: [
                {
                    label: '👨‍💻 Developer',
                    click: () => mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/cv.pdf')
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
                    click: () => {
                        checkAndUpdateSilently();
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Update Check',
                            message: 'Checking for updates in the background. The app will restart automatically if updates are found.',
                            buttons: ['OK']
                        });
                    }
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

function handleAppUpdate() {
    // Deprecated - Now using silent auto-update
    checkAndUpdateSilently();
}

// App lifecycle events
app.on('ready', () => {
    loadNotificationModule();
    createWindow();
    createMenu();
    
    // Start auto-update checker
    startAutoUpdateChecker();
    
    // Log that auto-update is enabled
    console.log(`Silent auto-update enabled - checking every ${AUTO_UPDATE_INTERVAL / 1000} seconds`);

    // Tray icon setup
    try {
        tray = new Tray(path.join(__dirname, 'icon.ico'));
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show App', click: () => mainWindow.show() },
            { label: 'Check for Updates', click: () => checkAndUpdateSilently() },
            { label: 'Quit', click: () => app.quit() }
        ]);
        tray.setToolTip('Stock Keeper (Auto-Update Enabled)');
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
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
    }
    if (mainWindow) {
        mainWindow.destroy();
    }
    process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// IPC notification handler
ipcMain.on('order-notification', (event, notification) => {
    try {
        const { Notification } = require('electron');
        new Notification({ title: 'Order Notification', body: notification }).show();
    } catch (err) {
        console.error('Failed to show notification:', err);
    }
});

// Handle app state restoration after update
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
