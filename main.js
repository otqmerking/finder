const { app, BrowserWindow, ipcMain, clipboard, Menu, session, dialog, shell, Tray, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http'); // Add this line
const prompt = require('electron-prompt');

app.commandLine.appendSwitch('disable-features', 'CookiesWithoutSameSiteMustBeSecure');

let mainWindow;
let tray = null;

// Function to create the main window
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
            preload: path.join(__dirname, 'preload.js') // Add preload script
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

    mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/login.php');

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });

    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    ipcMain.on('copy-to-clipboard', (event, text) => {
        clipboard.writeText(text);
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key === 'f' && input.type === 'keyDown') {
            handleFindInPage(mainWindow);
        }
        if (input.key === 'F4' && input.type === 'keyDown') app.quit();
        else if (input.key === 'Escape' && input.type === 'keyDown') mainWindow.minimize();
        else if (input.key === 'F2' && input.type === 'keyDown') mainWindow.webContents.goBack();
    });

    mainWindow.webContents.on('found-in-page', (event, result) => {
        if (result.finalUpdate) {
            console.log(`Found ${result.matches} matches`);
        }
    });

    // Handle new windows
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.endsWith('.pdf')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }

        const newWindow = new BrowserWindow({
            width: 800,
            height: 600,
            frame: false, // Frameless window
            webPreferences: {
                contextIsolation: true,
                enableRemoteModule: false,
                nodeIntegration: false,
            },
        });

        newWindow.loadURL(url);

        // Add `Ctrl + F` to the new window
        newWindow.webContents.on('before-input-event', (event, input) => {
            if (input.control && input.key === 'f' && input.type === 'keyDown') {
                handleFindInPage(newWindow);
            }
        });

        return {
            action: 'allow', // Allow the new window to open
        };
    });

    // Start background process to check for new orders
    setInterval(checkForNewOrders, 5000); // Check every 5 seconds
}

// Function to handle "Find in Page" logic
function handleFindInPage(targetWindow) {
    prompt({
        title: 'Find in Page',
        label: 'Enter search term:',
        inputAttrs: {
            type: 'text',
        },
        type: 'input',
    })
        .then((result) => {
            if (result !== null && result.trim() !== '') {
                targetWindow.webContents.findInPage(result);
            } else {
                console.log('Search term cannot be empty');
            }
        })
        .catch((err) => {
            console.error('Error showing input box:', err);
        });
}

// Function to create the menu
function createMenu() {
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Home',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/index.php');
                    },
                },
                { role: 'quit', label: 'Exit' },
                {
                    label: 'Sign out',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/logout.php');
                    },
                },
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
                {
                    label: 'Orders',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/order/notifications.html');
                    },
                },
                {
                    label: 'Catalogs',
                    click: () => {
                        mainWindow.loadURL('https://10.71.16.70/Finder/resources/app/pdf/pdf.php');
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
                    label: 'Update',
                    click: () => {
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
                    },
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

app.on('ready', () => {
    createWindow();
    createMenu();

    tray = new Tray(path.join(__dirname, 'icon.ico'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => { mainWindow.show(); } },
        { label: 'Quit', click: () => { app.quit(); } }
    ]);
    tray.setToolTip('Stock Keeper');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

ipcMain.on('order-notification', (event, notification) => {
    new Notification({ title: 'Order Notification', body: notification }).show();
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Function to check for new orders
function checkForNewOrders() {
    http.get('http://10.71.16.70/Finder/Resources/app/order/orders.txt', (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            const orders = data.split('\n').filter(order => order.trim() !== '');

            if (orders.length > 0) {
                const lastOrder = orders[orders.length - 1];
                const [userPart, matriculePart, dpnPart, quantityPart, dateTimePart] = lastOrder.split(', ');
                const user = userPart.split(': ')[1];
                const matricule = matriculePart.split(': ')[1];
                const dpn = dpnPart.split(': ')[1];
                const quantity = quantityPart.split(': ')[1];
                const dateTime = dateTimePart.split(': ')[1];
                const orderDate = new Date(dateTime);

				const notification = new Notification({
					title: 'New Order',
					body: `You have a new order:\nThe technician ${user} ${matricule} has ordered ${quantity} of the DPN ${dpn}\nDate: ${orderDate.toLocaleDateString()}, Time: ${orderDate.toLocaleTimeString()}`,
					silent: false,
					sound: path.join(__dirname, 'notify.mp3')
				});

				notification.on('click', () => {
					mainWindow.show(); // Bring the main window to the front
					mainWindow.loadURL('https://10.71.16.70/finder/resources/app/order/notifications.html'); // Load the specified URL
				});

				notification.show();

                // Send notification to renderer process
                mainWindow.webContents.send('order-notification', `You have a new order:\nThe technician ${user} ${matricule} has ordered ${quantity} of the DPN ${dpn}\nDate: ${orderDate.toLocaleDateString()}, Time: ${orderDate.toLocaleTimeString()}`);
            }
        });

    }).on('error', (err) => {
        console.error('Error fetching orders.txt:', err);
    });
}
