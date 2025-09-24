const WebSocket = require('ws');
const chalk = require('chalk');

const PORT = 8081;
const wss = new WebSocket.Server({ port: PORT });

console.log(chalk.green(`🔧 Debug WebSocket server running on ws://localhost:${PORT}`));
console.log(chalk.yellow('📱 Logs from your iPhone will appear here:\n'));

wss.on('connection', (ws) => {
  console.log(chalk.cyan('📱 Mobile device connected for debugging'));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const timestamp = new Date().toTimeString().split(' ')[0];
      
      // Color code based on log level
      let logFn = console.log;
      let prefix = '📝';
      let color = chalk.white;
      
      if (data.level === 'error') {
        logFn = console.error;
        prefix = '❌';
        color = chalk.red;
      } else if (data.level === 'warn') {
        logFn = console.warn;
        prefix = '⚠️';
        color = chalk.yellow;
      } else if (data.level === 'info') {
        prefix = 'ℹ️';
        color = chalk.blue;
      } else if (data.level === 'debug') {
        prefix = '🔍';
        color = chalk.gray;
      }
      
      // Format the output
      const header = chalk.gray(`[${timestamp}]`) + ` ${prefix} ` + color(data.message);
      logFn(header);
      
      if (data.data) {
        console.log(chalk.gray('   Data:'), JSON.stringify(data.data, null, 2));
      }
    } catch (e) {
      // If not JSON, just log as-is
      console.log(chalk.gray('[RAW]'), message.toString());
    }
  });
  
  ws.on('close', () => {
    console.log(chalk.yellow('📱 Mobile device disconnected'));
  });
});

console.log(chalk.gray('\nWaiting for mobile connections...'));