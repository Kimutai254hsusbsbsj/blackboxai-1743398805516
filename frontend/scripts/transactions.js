document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'index.html';
        return;
    }

    // Set user initial
    document.getElementById('user-initial').textContent = user.email.charAt(0).toUpperCase();

    // Logout functionality
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // Tab switching
    const tabs = {
        'send-tab': 'send-content',
        'receive-tab': 'receive-content'
    };

    Object.entries(tabs).forEach(([tabId, contentId]) => {
        document.getElementById(tabId).addEventListener('click', () => {
            // Update tab styling
            document.querySelectorAll('.tab-button').forEach(tab => {
                tab.classList.remove('border-blue-500', 'text-blue-600');
                tab.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
            });
            document.getElementById(tabId).classList.add('border-blue-500', 'text-blue-600');
            document.getElementById(tabId).classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');

            // Show/hide content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(contentId).classList.add('active');
        });
    });

    // Check URL for action parameter
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'receive') {
        document.getElementById('receive-tab').click();
    }

    // Currency symbol update for send form
    document.getElementById('send-currency').addEventListener('change', function() {
        const currency = this.value;
        const symbol = getCurrencySymbol(currency);
        document.getElementById('send-currency-symbol').textContent = symbol;
    });

    // Copy wallet address button
    document.getElementById('copy-address').addEventListener('click', () => {
        const address = document.getElementById('wallet-address').textContent;
        navigator.clipboard.writeText(address).then(() => {
            const button = document.getElementById('copy-address');
            button.innerHTML = '<i class="fas fa-check mr-1"></i> Copied!';
            setTimeout(() => {
                button.innerHTML = '<i class="fas fa-copy mr-1"></i> Copy Address';
            }, 2000);
        });
    });

    // Send money form submission
    document.getElementById('send-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currency = document.getElementById('send-currency').value;
        const amount = parseFloat(document.getElementById('send-amount').value);
        const recipientEmail = document.getElementById('recipient-email').value;
        const note = document.getElementById('send-note').value;

        if (!amount || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        if (!recipientEmail) {
            alert('Please enter recipient email');
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/api/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    amount,
                    currency,
                    recipient_id: recipientEmail,
                    transaction_type: 'send',
                    note
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Transaction sent successfully!');
                document.getElementById('send-form').reset();
                loadTransactions();
            } else {
                alert(data.error || 'Transaction failed');
            }
        } catch (error) {
            console.error('Transaction error:', error);
            alert('An error occurred while processing your transaction');
        }
    });

    // Load initial transactions
    loadTransactions();
});

function getCurrencySymbol(currency) {
    const symbols = {
        'USD': '$',
        'EUR': '€',
        'BTC': '₿',
        'ETH': 'Ξ'
    };
    return symbols[currency] || currency;
}

async function loadTransactions() {
    try {
        const response = await fetch('http://localhost:8000/api/transactions', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const transactions = await response.json();
            displayTransactions(transactions);
        } else {
            console.error('Failed to load transactions');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function displayTransactions(transactions) {
    const container = document.getElementById('transaction-list');
    container.innerHTML = '';

    if (transactions.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-gray-500">No transactions found</div>';
        return;
    }

    transactions.forEach(tx => {
        const txElement = document.createElement('div');
        txElement.className = 'p-4 flex items-center justify-between';
        
        const isSend = tx.transaction_type === 'send';
        const amountClass = isSend ? 'text-red-500' : 'text-green-500';
        const amountPrefix = isSend ? '-' : '+';
        const icon = isSend ? 'fa-paper-plane' : 'fa-download';
        const iconColor = isSend ? 'text-blue-500' : 'text-green-500';

        txElement.innerHTML = `
            <div class="flex items-center space-x-4">
                <div class="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <i class="fas ${icon} ${iconColor}"></i>
                </div>
                <div>
                    <p class="font-medium">${isSend ? 'Sent to ' + tx.recipient_id : 'Received from ' + tx.recipient_id}</p>
                    <p class="text-sm text-gray-500">${new Date(tx.timestamp).toLocaleString()}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-medium ${amountClass}">${amountPrefix} ${tx.amount} ${tx.currency}</p>
                <p class="text-sm text-gray-500 capitalize">${tx.status}</p>
            </div>
        `;
        
        container.appendChild(txElement);
    });

    document.getElementById('transaction-count').textContent = `Showing ${transactions.length} transactions`;
}