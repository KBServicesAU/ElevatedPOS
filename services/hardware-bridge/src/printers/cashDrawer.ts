import net from 'net';

// ESC/POS cash drawer kick command: ESC p 0 25 250
// Pin 2 kick with 25 * 2ms on, 250 * 2ms off
const CASH_DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export function openCashDrawer(config: { host: string; port: number }): Promise<void> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function settle() {
      if (!settled) {
        settled = true;
        resolve();
      }
    }

    socket.on('error', (err) => {
      console.error('[HardwareBridge][CashDrawer] TCP error:', err.message);
      settle();
    });

    socket.connect(config.port, config.host, () => {
      try {
        socket.write(CASH_DRAWER_KICK);
        setTimeout(() => {
          socket.destroy();
          settle();
        }, 500);
      } catch (err) {
        console.error('[HardwareBridge][CashDrawer] Write error:', err);
        socket.destroy();
        settle();
      }
    });

    socket.on('close', () => settle());
  });
}
