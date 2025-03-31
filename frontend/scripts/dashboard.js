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

    // Load wallet balances
    loadWalletBalances();

    // Quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleQuickAction(action);
        });
    });

    // Load recent transactions
    loadRecentTransactions();
});

async function loadWalletBalances() {
    try {
        const response = await fetch('http://localhost:8000/api/user/balance', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const balances = await response.json();
            updateBalanceDisplays(balances);
        } else {
            console.error('Failed to load balances');
        }
    } catch (error) {
        console.error('Error loading balances:', error);
    }
}

function updateBalanceDisplays(balances) {
    if (balances.USD) {
        document.getElementById('usd-balance').textContent = `$${balances.USD.toFixed(2)}`;
    }
    if (balances.EUR) {
        document.getElementById('eur-balance').textContent = `€${balances.EUR.toFixed(2)}`;
    }
    if (balances.BTC) {
        document.getElementById('btc-balance').textContent = `${balances.BTC.toFixed(8)} BTC`;
    }
    if (balances.ETH) {
        document.getElementById('eth-balance').textContent = `${balances.ETH.toFixed(6)} ETH`;
    }
}

async function loadRecentTransactions() {
    try {
        const response = await fetch('http://localhost:8000/api/transactions', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const transactions = await response.json();
            // TODO: Implement transaction display logic
            console.log('Recent transactions:', transactions);
        } else {
            console.error('Failed to load transactions');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function handleQuickAction(action) {
    switch(action) {
        case 'send':
            window.location.href = 'transactions.html?action=send';
            break;
        case 'receive':
            window.location.href = 'transactions.html?action=receive';
            break;
        case 'exchange':
            // TODO: Implement exchange functionality
            alert('Exchange functionality coming soon!');
            break;
        case 'history':
            window.location.href = 'transactions.html';
            break;
        default:
            console.log('Unknown action:', action);
    }
}

// Listen for balance updates (would be connected to WebSocket in production)
setInterval(loadWalletBalances, 30000); // Refresh every 30 seconds