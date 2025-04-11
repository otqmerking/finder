const { Notification } = require('electron');
const path = require('path');
const http = require('http');

function showNewOrderNotification(mainWindow, orderDetails) {
    try {
        const { user, matricule, dpn, quantity, orderDate } = orderDetails;
        
        const notification = new Notification({
            title: 'New Order',
            body: `You have a new order:\nThe technician ${user} ${matricule} has ordered ${quantity} of the DPN ${dpn}\nDate: ${orderDate.toLocaleDateString()}, Time: ${orderDate.toLocaleTimeString()}`,
            silent: false,
            sound: path.join(__dirname, 'notify.mp3')
        });

        notification.on('click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.loadURL('https://10.71.16.70/finder/resources/app/order/notifications.php');
            }
        });

        notification.show();
    } catch (err) {
        console.error('Notification error:', err);
    }
}

function checkForNewOrders(mainWindow) {
    try {
        http.get('http://10.71.16.70/Finder/Resources/app/order/orders.txt', (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => processOrders(data, mainWindow));
        }).on('error', (err) => {
            console.error('Error checking orders:', err);
        });
    } catch (err) {
        console.error('Order check error:', err);
    }
}

function processOrders(data, mainWindow) {
    try {
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

            showNewOrderNotification(mainWindow, { user, matricule, dpn, quantity, orderDate });

            if (mainWindow?.webContents) {
                mainWindow.webContents.send('order-notification', 
                    `You have a new order:\nThe technician ${user} ${matricule} has ordered ${quantity} of the DPN ${dpn}\nDate: ${orderDate.toLocaleDateString()}, Time: ${orderDate.toLocaleTimeString()}`
                );
            }
        }
    } catch (err) {
        console.error('Order processing error:', err);
    }
}

module.exports = {
    showNewOrderNotification,
    checkForNewOrders
};
