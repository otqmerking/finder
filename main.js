const { app, BrowserWindow, ipcMain, clipboard, Menu, session, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');

app.commandLine.appendSwitch('disable-features', 'CookiesWithoutSameSiteMustBeSecure');
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        fullscreen: true,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    const currentSession = session.defaultSession;
    currentSession.clearCache();

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

    mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/login.php');

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });

    mainWindow.on('close', () => {
        mainWindow = null;
    });

    ipcMain.on('copy-to-clipboard', (event, text) => {
        clipboard.writeText(text);
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F4' && input.type === 'keyDown') app.quit();
        else if (input.key === 'Escape' && input.type === 'keyDown') mainWindow.minimize();
        else if (input.key === 'F2' && input.type === 'keyDown') mainWindow.webContents.goBack();
    });
}

function createMenu() {
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Home',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/login.php');
                    },
                },
                { role: 'quit', label: 'Exit' },
            ],
        },
        {
            label: 'Services',
            submenu: [
                {
                    label: 'Tech',
                    click: () => {
                        mainWindow.loadURL('http://10.71.16.70/Finder/resources/app/tech/tech.php');
                    },
                },
                {
                    label: 'Stock Manager',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/stock/admin.php');
                    },
                },
            ],
        },
        {
            label: 'Developer',
            submenu: [
                {
                    label: 'CV',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/cv.html');
                    },
                },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload', label: 'Reload' },
                { role: 'forceReload', label: 'Force Reload' },
                { role: 'resetZoom', label: 'Actual Size' },
                { role: 'zoomIn', label: 'Zoom In' },
                { role: 'zoomOut', label: 'Zoom Out' },
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
					label: 'update',
					click: () => {
						const localFilePath = path.join(__dirname, 'main.js');
						const remoteFileUrl = 'https://raw.githubusercontent.com/otqmerking/finder/main/main.js';

						const file = fs.createWriteStream(localFilePath);
						https.get(remoteFileUrl, (response) => { // Use https here
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
											app.relaunch(); // Relaunch the app
											app.exit(); // Ensure the app closes before relaunching
										}
									});
								});
							} else {
								dialog.showMessageBox(mainWindow, {
									type: 'error',
									title: 'Update Failed',
									message: 'Error updating Finder. Please contact Amine.',
								});
							}
						}).on('error', (err) => {
							dialog.showMessageBox(mainWindow, {
								type: 'error',
								title: 'Update Failed',
								message: `Error updating Finder. Please contact Amine. \n${err.message}`,
							});
						});
					},
				}
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

app.on('ready', () => {
    createWindow();
    createMenu();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});
