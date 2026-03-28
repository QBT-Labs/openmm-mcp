#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const CONFIG_PATHS: Record<string, Record<string, string>> = {
  'Claude Desktop': {
    darwin: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    ),
    win32: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    linux: path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
  },
  'Claude Code': {
    darwin: path.join(os.homedir(), '.claude', 'settings.json'),
    win32: path.join(os.homedir(), '.claude', 'settings.json'),
    linux: path.join(os.homedir(), '.claude', 'settings.json'),
  },
  Cursor: {
    darwin: path.join(os.homedir(), '.cursor', 'mcp.json'),
    win32: path.join(os.homedir(), '.cursor', 'mcp.json'),
    linux: path.join(os.homedir(), '.cursor', 'mcp.json'),
  },
  Windsurf: {
    darwin: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    win32: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    linux: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
  },
};

const MCP_ENV = {
  MCP_TRANSPORT: 'stdio',
  OPENMM_SOCKET: '/tmp/openmm.sock',
  PAYMENT_SERVER: 'https://mcp.openmm.io',
  X402_TESTNET: 'true',
};

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function selectMultiple(
  rl: readline.Interface,
  prompt: string,
  options: { id: string; name: string }[]
): Promise<string[]> {
  return new Promise((resolve) => {
    console.log(`\n${prompt}`);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.name}`));
    console.log('\n  Enter numbers separated by commas (e.g., 1,2,3)');
    console.log('  Or press Enter for all');
    rl.question('\nYour selection: ', (answer) => {
      if (!answer.trim()) {
        resolve(options.map((o) => o.id));
        return;
      }
      const indices = answer
        .split(',')
        .map((s) => parseInt(s.trim()) - 1)
        .filter((i) => i >= 0 && i < options.length);
      if (indices.length === 0) {
        resolve(options.map((o) => o.id));
      } else {
        resolve(indices.map((i) => options[i].id));
      }
    });
  });
}

function readConfig(configPath: string): Record<string, unknown> {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // File doesn't exist or invalid JSON
  }
  return {};
}

function writeConfig(configPath: string, config: Record<string, unknown>): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║    ██████╗ ██████╗ ███████╗███╗   ██╗███╗   ███╗███╗   ███╗   ║
║   ██╔═══██╗██╔══██╗██╔════╝████╗  ██║████╗ ████║████╗ ████║   ║
║   ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██╔████╔██║██╔████╔██║   ║
║   ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║╚██╔╝██║██║╚██╔╝██║   ║
║   ╚██████╔╝██║     ███████╗██║ ╚████║██║ ╚═╝ ██║██║ ╚═╝ ██║   ║
║    ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝     ╚═╝   ║
║                                                               ║
║   AI-Native Market Making Infrastructure                      ║
║   Configure MCP clients to use the unified vault              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main(): Promise<void> {
  console.log(BANNER);

  const rl = createReadlineInterface();
  const platform = process.platform as 'darwin' | 'win32' | 'linux';

  try {
    const clientOptions = Object.keys(CONFIG_PATHS).map((name) => ({ id: name, name }));
    const selectedClientNames = await selectMultiple(
      rl,
      'Which MCP clients do you want to configure?',
      clientOptions
    );

    const selectedClients: { name: string; path: string }[] = [];
    for (const clientName of selectedClientNames) {
      const configPath = CONFIG_PATHS[clientName][platform];
      if (configPath) {
        selectedClients.push({ name: clientName, path: configPath });
      }
    }

    if (selectedClients.length === 0) {
      console.error(`❌ No supported clients for platform: ${platform}`);
      process.exit(1);
    }

    for (const client of selectedClients) {
      const config = readConfig(client.path);

      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      const servers = config.mcpServers as Record<string, unknown>;

      servers['openmm'] = {
        command: 'npx',
        args: ['-y', '@qbtlabs/openmm-mcp'],
        env: { ...MCP_ENV },
      };

      writeConfig(client.path, config);
      console.log(`✅ ${client.name}: ${client.path}`);
    }

    console.log(`\n✓ Config updated. Run 'openmm serve' before launching your client.\n`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
