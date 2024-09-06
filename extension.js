const vscode = require('vscode');
const http = require('http');
const httpProxy = require('http-proxy');

const proxyPort = 47123;
let whitelist = [];
let blacklist = [];

function activate(context) {
    console.log('Extension CodeShield is now active!');

    // Load whitelist and blacklist from configuration
    loadConfiguration();

    // Start the proxy server
    const proxyServer = startProxyServer();
    context.subscriptions.push(proxyServer);

    // Configure proxy settings in VS Code
    context.subscriptions.push(configureProxy());
}

function deactivate() {
    console.log('Extension CodeShield is now deactivated!');
    configureProxy(true);
}

async function configureProxy(clear = false) {
    const config = vscode.workspace.getConfiguration();
    const proxyUrl = clear ? null : `http://127.0.0.1:${proxyPort}`;

    await config.update('http.proxy', proxyUrl, vscode.ConfigurationTarget.Global);
    await config.update('http.proxyStrictSSL', false, vscode.ConfigurationTarget.Global);
    await config.update('http.proxySupport', 'override', vscode.ConfigurationTarget.Global);

    console.log('Proxy configuration updated successfully.');
}

function startProxyServer() {
    const proxy = httpProxy.createProxyServer({});

    function isWhitelisted(url) {
        return whitelist.includes(url);
    }

    function isBlacklisted(url) {
        return blacklist.includes(url);
    }

    function addToWhitelist(url) {
        if (!whitelist.includes(url)) {
            whitelist.push(url);
            updateConfiguration('whitelist', whitelist);
        }
    }

    function addToBlacklist(url) {
        if (!blacklist.includes(url)) {
            blacklist.push(url);
            updateConfiguration('blacklist', blacklist);
        }
    }

    function showUserPrompt(url) {
        return new Promise((resolve) => {
            vscode.window.showInformationMessage(
                `VSCode is trying to access ${url}. Do you want to allow it?`,
                'Allow', 'Block'
            ).then(selection => {
                resolve(selection === 'Allow');
            });
        });
    }

    const server = http.createServer((req, res) => {
        const targetUrl = req.url;

        console.log(`CodeShield intercepted request to ${targetUrl}`);

        if (isWhitelisted(targetUrl)) {
            proxy.web(req, res, { target: targetUrl });
        } else if (isBlacklisted(targetUrl)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Blocked by CodeShield');
        } else {
            showUserPrompt(targetUrl).then(allowed => {
                if (allowed) {
                    addToWhitelist(targetUrl);
                    proxy.web(req, res, { target: targetUrl });
                } else {
                    addToBlacklist(targetUrl);
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('Blocked by CodeShield');
                }
            });
        }
    });

    server.listen(proxyPort, () => {
        console.log(`Proxy server running on port ${proxyPort}`);
    });

    // Return a disposable to stop the proxy server when the extension is deactivated
    return new vscode.Disposable(() => {
        server.close();
        console.log('Proxy server stopped');
    });
}

function updateConfiguration(key, value) {
    const config = vscode.workspace.getConfiguration('CodeShield');
    config.update(key, value, vscode.ConfigurationTarget.Global).then(() => {
        console.log(`Configuration for ${key} updated successfully.`);
    }, (error) => {
        console.error(`Error updating configuration for ${key}: ${error}`);
    });
}

function loadConfiguration() {
    const config = vscode.workspace.getConfiguration('CodeShield');
    whitelist = config.get('whitelist', []);
    blacklist = config.get('blacklist', []);
    console.log('Whitelist and blacklist loaded from configuration.');
}

module.exports = {
    activate,
    deactivate
};
