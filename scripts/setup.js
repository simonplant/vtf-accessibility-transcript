#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log(`
╔═══════════════════════════════════════╗
║   VTF Audio Extension Setup Wizard    ║
╚═══════════════════════════════════════╝
`);

class SetupWizard {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.errors = [];
  }

  async run() {
    try {
      await this.checkEnvironment();
      await this.createDirectories();
      await this.checkDependencies();
      await this.createPlaceholderFiles();
      await this.makeScriptsExecutable();
      await this.runInitialBuild();
      await this.showNextSteps();
    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  async checkEnvironment() {
    
    
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.split('.')[0].substring(1));
    
    if (major < 18) {
      throw new Error(`Node.js 18+ required (you have ${nodeVersion})`);
    }
    
    
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      
    } catch {
      throw new Error('npm not found');
    }
    
    
    const platform = process.platform;
    
    if (platform !== 'darwin') {
      
    }
  }

  async createDirectories() {
    
    const dirs = [
      'src/icons',
      'src/workers',
      'src/modules',
      'test/unit',
      'test/integration',
      'scripts',
      'dist'
    ];
    
    for (const dir of dirs) {
      const fullPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        
      } else {
        
      }
    }
  }

  async checkDependencies() {
    
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
    
    if (!fs.existsSync(nodeModulesPath)) {
      
      execSync('npm install', { 
        cwd: this.projectRoot,
        stdio: 'inherit' 
      });
    } else {
      
    }
  }

  async createPlaceholderFiles() {
    
    
    const iconSizes = [16, 48, 128];
    for (const size of iconSizes) {
      const iconPath = path.join(this.projectRoot, `src/icons/icon${size}.png`);
      if (!fs.existsSync(iconPath)) {
        
        
      }
    }
    
    
    const criticalFiles = [
      'src/manifest.json',
      'src/background.js',
      'src/content.js',
      'src/popup.html',
      'src/options.html'
    ];
    
    for (const file of criticalFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing critical file: ${file}`);
      }
      
    }
  }

  async makeScriptsExecutable() {
    
    const scriptsDir = path.join(this.projectRoot, 'scripts');
    const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
    
    for (const script of scripts) {
      const scriptPath = path.join(scriptsDir, script);
      try {
        fs.chmodSync(scriptPath, '755');
        
      } catch (error) {
        
      }
    }
  }

  async runInitialBuild() {
    
    try {
      execSync('npm run build', {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });
      
    } catch (error) {
      throw new Error('Initial build failed');
    }
  }

  async showNextSteps() {
    console.log(`
╔═══════════════════════════════════════╗
║        ✨ Setup Complete! ✨          ║
╚═══════════════════════════════════════╝

Available commands:
  npm run dev      Start development mode (auto-rebuild)
  npm run build    Build the extension
  npm run package  Create distribution .zip
  npm run clean    Remove build artifacts
  npm run test     Run tests

Quick start:
  1. npm run dev
  2. Open chrome:
  3. Enable "Developer mode"
  4. Click "Load unpacked"
  5. Select the "dist" folder

Happy coding! 🚀
`);
  }
}

new SetupWizard().run();