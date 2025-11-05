const { app, BrowserWindow, ipcMain, clipboard, Menu, session, dialog, shell, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
    mainWindow.loadURL('https://dlbsxk8q3.aptiv.com/Finder/resources/app/login.php');

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
        modal: false, // Changed to false to allow dragging
        width: 400,
        height: 120,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        movable: true, // Enable window movement
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
                    -webkit-app-region: drag; /* Make entire window draggable */
                    height: 100vh;
                    overflow: hidden;
                }
                .search-container {
                    display: flex;
                    padding: 10px;
                    align-items: center;
                    -webkit-app-region: no-drag; /* Make input area not draggable */
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
                    -webkit-app-region: no-drag; /* Make hint text not draggable */
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
                
                // Focus the input when window is shown
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

    // Add slight transparency effect for a modern look
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
                    label: '🔄 Update',
                    click: () => handleAppUpdate()
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
    const filesToUpdate = [
        {
            localPath: path.join(__dirname, 'main.js'),
            remoteUrl: 'https://raw.githubusercontent.com/otqmerking/finder/main/main.js'
        },
        {
            localPath: path.join(__dirname, 'notify', 'notify.js'),
            remoteUrl: 'https://raw.githubusercontent.com/otqmerking/finder/main/notify.js',
            ensureDirectory: true
        }
    ];

    let filesUpdated = 0;
    let errors = [];

    filesToUpdate.forEach(file => {
        try {
            // Create directory if needed
            if (file.ensureDirectory) {
                const dir = path.dirname(file.localPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }

            const fileStream = fs.createWriteStream(file.localPath);
            https.get(file.remoteUrl, (response) => {
                if (response.statusCode === 200) {
                    response.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        filesUpdated++;
                        checkUpdateCompletion();
                    });
                } else {
                    errors.push(`Failed to download ${path.basename(file.localPath)}: HTTP ${response.statusCode}`);
                    checkUpdateCompletion();
                }
            }).on('error', (err) => {
                errors.push(`Error downloading ${path.basename(file.localPath)}: ${err.message}`);
                checkUpdateCompletion();
            });
        } catch (err) {
            errors.push(`Error preparing to update ${path.basename(file.localPath)}: ${err.message}`);
            checkUpdateCompletion();
        }
    });

    function checkUpdateCompletion() {
        if (filesUpdated + errors.length === filesToUpdate.length) {
            showUpdateResult();
        }
    }

    function showUpdateResult() {
        if (errors.length === 0) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Successful',
                message: 'All files updated successfully. Restart the app now or later?',
                buttons: ['Restart', 'Later'],
            }).then((result) => {
                if (result.response === 0) {
                    app.relaunch();
                    app.exit();
                }
            });
        } else {
            let errorMessage = `${filesUpdated} file(s) updated successfully.\n\n`;
            errorMessage += `${errors.length} error(s) occurred:\n\n`;
            errorMessage += errors.join('\n');

            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Update Completed With Errors',
                message: errorMessage,
                buttons: ['OK'],
            });
        }
    }
}

// App lifecycle events
app.on('ready', () => {
    loadNotificationModule();
    createWindow();
    createMenu();

    // Tray icon setup
    try {
        tray = new Tray(path.join(__dirname, 'icon.ico'));
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show App', click: () => mainWindow.show() },
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
    mainWindow.destroy();
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
