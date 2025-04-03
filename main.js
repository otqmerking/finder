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
    mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/login.php');

    // Security handling
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });

    // Window event handlers
    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    // IPC handlers
    ipcMain.on('copy-to-clipboard', (event, text) => {
        clipboard.writeText(text);
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

function isNotifyEnabled() {
    return fs.existsSync(path.join(__dirname, 'notify.js'));
}

function toggleNotifications() {
    const sourcePath = path.join(__dirname, 'notify', 'notify.js');
    const destPath = path.join(__dirname, 'notify.js');
    
    if (isNotifyEnabled()) {
        // Remove notify.js
        try {
            fs.unlinkSync(destPath);
            console.log('Notifications disabled - notify.js removed');
        } catch (err) {
            console.error('Error removing notify.js:', err);
            dialog.showErrorBox('Error', 'Failed to disable notifications');
            return;
        }
    } else {
        // Copy notify.js from notify folder
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
    
    // Reload the app
    app.relaunch();
    app.exit();
}

function createMenu() {
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Home',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/index.php')
                },
                { role: 'quit', label: 'Exit' },
                {
                    label: 'Sign out',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/logout.php')
                },
            ]
        },
        {
            label: 'Services',
            submenu: [
                {
                    label: 'Tech',
                    click: () => mainWindow.loadURL('http://10.71.16.70/Finder/resources/app/tech/tech.php')
                },
                {
                    label: 'Stock Manager',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/stock/admin.php')
                },
                {
                    label: 'Orders',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/order/notifications.html')
                },
                {
                    label: 'Catalogs',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/pdf/pdf.php')
                },
                {
                    label: 'Consumption',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/consumption/consumption.html')
                },
            ]
        },
        {
            label: 'Developer',
            submenu: [
                {
                    label: 'CV',
                    click: () => mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/cv.html')
                },
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload', label: 'Reload' },
                { role: 'forceReload', label: 'Force Reload' },
                { role: 'resetZoom', label: 'Actual Size' },
                { role: 'zoomIn', label: 'Zoom In' },
                { role: 'zoomOut', label: 'Zoom Out' },
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Update',
                    click: () => handleAppUpdate()
                },
                {
                    id: 'toggle-notifications',
                    label: isNotifyEnabled() ? 'Notify Off' : 'Notify On',
                    click: () => toggleNotifications()
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function handleAppUpdate() {
    const localFilePath = path.join(__dirname, 'main.js');
    const remoteFileUrl = 'https://raw.githubusercontent.com/otqmerking/finder/main/main.js';

    const file = fs.createWriteStream(localFilePath);
    https.get(remoteFileUrl, (response) => {
        if (response.statusCode === 200) {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Update Successful',
                    message: 'Finder is updated successfully. Restart the app now or later?',
                    buttons: ['Restart', 'Later'],
                }).then((result) => {
                    if (result.response === 0) {
                        app.relaunch();
                        app.exit();
                    }
                });
            });
        } else {
            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Update Failed',
                message: 'Error updating Finder. Please contact support.',
            });
        }
    }).on('error', (err) => {
        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Update Failed',
            message: `Error updating Finder. \n${err.message}`,
        });
    });
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
