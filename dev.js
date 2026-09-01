const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting FeastFlow Services (Backend + Vite Frontend)...\n');

const isWin = process.platform === 'win32';
const viteBin = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');

const backend = spawn('node', ['server.js'], {
  stdio: 'inherit',
  shell: true
});

const frontend = spawn('node', [viteBin, '--host', '0.0.0.0', '--port', '5000'], {
  stdio: 'inherit',
  shell: true
});

function cleanup() {
  console.log('\n🛑 Stopping FeastFlow services...');
  try { backend.kill(); } catch (e) {}
  try { frontend.kill(); } catch (e) {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
