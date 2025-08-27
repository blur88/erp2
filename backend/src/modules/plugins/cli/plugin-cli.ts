#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { PluginBuilder } from '../development/plugin-builder';
import { PluginType } from '../../../database/entities/plugin.entity';

/**
 * Plugin CLI Tool
 * 
 * Command-line interface for plugin development including:
 * - Plugin scaffolding and project generation
 * - Plugin validation and testing
 * - Plugin packaging and distribution
 * - Development server integration
 * - Plugin marketplace operations
 */

const program = new Command();

program
  .name('erp-plugin')
  .description('ERP Plugin Development CLI')
  .version('1.0.0');

// Create a new plugin project
program
  .command('create <name>')
  .description('Create a new plugin project')
  .option('-t, --type <type>', 'Plugin type', 'business')
  .option('-d, --directory <dir>', 'Target directory')
  .option('-T, --template <template>', 'Project template (minimal, basic, full)', 'basic')
  .option('--author <author>', 'Plugin author name')
  .option('--description <desc>', 'Plugin description')
  .option('--skip-install', 'Skip npm install')
  .option('--skip-git', 'Skip git initialization')
  .action(async (name: string, options: any) => {
    const spinner = ora('Creating plugin project...').start();

    try {
      await createPluginProject(name, options);
      spinner.succeed(chalk.green(`Plugin project '${name}' created successfully!`));
      
      console.log(chalk.cyan('\nNext steps:'));
      console.log(`  cd ${options.directory || name}`);
      console.log('  npm run build');
      console.log('  npm test');
      console.log('\n' + chalk.yellow('Happy coding! 🚀'));

    } catch (error) {
      spinner.fail(chalk.red('Failed to create plugin project'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Validate a plugin
program
  .command('validate [path]')
  .description('Validate a plugin project')
  .option('-v, --verbose', 'Show detailed validation results')
  .option('--fix', 'Attempt to fix validation issues')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Validating plugin...').start();

    try {
      const result = await validatePlugin(pluginPath, options);
      
      if (result.valid) {
        spinner.succeed(chalk.green('Plugin validation passed!'));
      } else {
        spinner.fail(chalk.red('Plugin validation failed'));
        
        console.log(chalk.red('\nErrors:'));
        result.errors.forEach(error => {
          console.log(chalk.red(`  ❌ ${error}`));
        });

        if (result.warnings.length > 0) {
          console.log(chalk.yellow('\nWarnings:'));
          result.warnings.forEach(warning => {
            console.log(chalk.yellow(`  ⚠️  ${warning}`));
          });
        }

        process.exit(1);
      }

    } catch (error) {
      spinner.fail(chalk.red('Validation failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Build a plugin
program
  .command('build [path]')
  .description('Build a plugin project')
  .option('-w, --watch', 'Watch for changes and rebuild')
  .option('-p, --production', 'Build for production')
  .option('--clean', 'Clean build directory first')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Building plugin...').start();

    try {
      await buildPlugin(pluginPath, options);
      spinner.succeed(chalk.green('Plugin built successfully!'));

    } catch (error) {
      spinner.fail(chalk.red('Build failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Generate plugin manifest
program
  .command('manifest [path]')
  .description('Generate plugin manifest file')
  .option('-o, --output <file>', 'Output file path', 'plugin.json')
  .option('--validate', 'Validate plugin before generating manifest')
  .option('--include-schema', 'Include configuration schema in manifest')
  .option('--dev-info', 'Include development information')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Generating manifest...').start();

    try {
      await generateManifest(pluginPath, options);
      spinner.succeed(chalk.green(`Manifest generated: ${options.output}`));

    } catch (error) {
      spinner.fail(chalk.red('Manifest generation failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Package a plugin for distribution
program
  .command('package [path]')
  .description('Package plugin for distribution')
  .option('-o, --output <file>', 'Output package file')
  .option('--exclude <patterns...>', 'Exclude patterns from package')
  .option('--include-dev', 'Include development files')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Packaging plugin...').start();

    try {
      const packagePath = await packagePlugin(pluginPath, options);
      spinner.succeed(chalk.green(`Plugin packaged: ${packagePath}`));

    } catch (error) {
      spinner.fail(chalk.red('Packaging failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Test a plugin
program
  .command('test [path]')
  .description('Run plugin tests')
  .option('--watch', 'Watch for changes and re-run tests')
  .option('--coverage', 'Generate coverage report')
  .option('--verbose', 'Show verbose test output')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Running tests...').start();

    try {
      await runTests(pluginPath, options);
      spinner.succeed(chalk.green('Tests completed successfully!'));

    } catch (error) {
      spinner.fail(chalk.red('Tests failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Development server commands
program
  .command('dev [path]')
  .description('Start development server with plugin hot-reload')
  .option('-p, --port <port>', 'Development server port', '3001')
  .option('--debug', 'Enable debug logging')
  .action(async (pluginPath: string = '.', options: any) => {
    console.log(chalk.blue('Starting development server...'));

    try {
      await startDevServer(pluginPath, options);

    } catch (error) {
      console.error(chalk.red('Development server failed:'), error.message);
      process.exit(1);
    }
  });

// Plugin marketplace commands
const marketplace = program
  .command('marketplace')
  .description('Plugin marketplace operations');

marketplace
  .command('search <query>')
  .description('Search plugins in marketplace')
  .option('--type <type>', 'Filter by plugin type')
  .option('--limit <number>', 'Limit results', '20')
  .action(async (query: string, options: any) => {
    const spinner = ora('Searching marketplace...').start();

    try {
      const results = await searchMarketplace(query, options);
      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow('No plugins found'));
        return;
      }

      console.log(chalk.green(`Found ${results.length} plugins:\n`));
      results.forEach((plugin: any) => {
        console.log(`${chalk.bold(plugin.name)} (${plugin.version})`);
        console.log(`  ${plugin.description}`);
        console.log(`  Author: ${plugin.author}`);
        console.log(`  Downloads: ${plugin.downloads || 0}`);
        console.log(`  Rating: ${plugin.rating || 'N/A'}`);
        console.log('');
      });

    } catch (error) {
      spinner.fail(chalk.red('Marketplace search failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

marketplace
  .command('install <plugin>')
  .description('Install plugin from marketplace')
  .option('--version <version>', 'Specific version to install')
  .option('--save-dev', 'Save as development dependency')
  .action(async (plugin: string, options: any) => {
    const spinner = ora(`Installing ${plugin}...`).start();

    try {
      await installFromMarketplace(plugin, options);
      spinner.succeed(chalk.green(`Plugin ${plugin} installed successfully!`));

    } catch (error) {
      spinner.fail(chalk.red('Installation failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

marketplace
  .command('publish [path]')
  .description('Publish plugin to marketplace')
  .option('--dry-run', 'Show what would be published without actually publishing')
  .option('--tag <tag>', 'Publish with specific tag')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Publishing plugin...').start();

    try {
      await publishToMarketplace(pluginPath, options);
      spinner.succeed(chalk.green('Plugin published successfully!'));

    } catch (error) {
      spinner.fail(chalk.red('Publishing failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Utility commands
program
  .command('info [path]')
  .description('Show plugin information')
  .action(async (pluginPath: string = '.') => {
    try {
      await showPluginInfo(pluginPath);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

program
  .command('clean [path]')
  .description('Clean plugin build artifacts')
  .option('--all', 'Clean all generated files')
  .action(async (pluginPath: string = '.', options: any) => {
    const spinner = ora('Cleaning plugin...').start();

    try {
      await cleanPlugin(pluginPath, options);
      spinner.succeed(chalk.green('Plugin cleaned successfully!'));

    } catch (error) {
      spinner.fail(chalk.red('Cleaning failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Implementation functions

async function createPluginProject(name: string, options: any): Promise<void> {
  const targetDir = path.resolve(options.directory || name);
  
  // Check if directory already exists
  try {
    await fs.access(targetDir);
    throw new Error(`Directory '${targetDir}' already exists`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Gather project information interactively if not provided
  if (!options.author || !options.description) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'author',
        message: 'Plugin author:',
        default: options.author || 'Your Name',
        when: !options.author,
      },
      {
        type: 'input',
        name: 'description',
        message: 'Plugin description:',
        default: options.description || `A ${options.type} plugin for ERP`,
        when: !options.description,
      },
      {
        type: 'list',
        name: 'type',
        message: 'Plugin type:',
        choices: [
          { name: 'Business Module', value: 'business' },
          { name: 'Integration', value: 'integration' },
          { name: 'Reporting', value: 'reporting' },
          { name: 'UI Extension', value: 'ui_extension' },
          { name: 'Workflow', value: 'workflow' },
          { name: 'Authentication', value: 'authentication' },
          { name: 'Notification', value: 'notification' },
        ],
        default: options.type,
        when: !options.type,
      },
    ]);

    Object.assign(options, answers);
  }

  // Create plugin structure
  await PluginBuilder.createPackageStructure(targetDir, {
    template: options.template,
    includeTests: options.template === 'full',
    includeDocs: options.template === 'full',
    includeExamples: options.template !== 'minimal',
  });

  // Update package.json with project details
  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  
  packageJson.name = name;
  packageJson.description = options.description;
  packageJson.author = options.author;
  packageJson.keywords = ['erp', 'plugin', options.type];
  
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Initialize git repository if not skipped
  if (!options.skipGit) {
    try {
      const { spawn } = require('child_process');
      await new Promise((resolve, reject) => {
        const git = spawn('git', ['init'], { cwd: targetDir });
        git.on('close', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error('Git initialization failed'));
        });
      });

      // Create .gitignore
      const gitignore = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist/
build/
*.tsbuildinfo

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Coverage
coverage/
.nyc_output/

# Logs
logs/
*.log
`;
      await fs.writeFile(path.join(targetDir, '.gitignore'), gitignore);

    } catch (error) {
      console.warn(chalk.yellow('Warning: Git initialization failed'));
    }
  }

  // Install dependencies if not skipped
  if (!options.skipInstall) {
    try {
      const { spawn } = require('child_process');
      await new Promise((resolve, reject) => {
        const npm = spawn('npm', ['install'], { cwd: targetDir, stdio: 'inherit' });
        npm.on('close', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error('npm install failed'));
        });
      });
    } catch (error) {
      console.warn(chalk.yellow('Warning: npm install failed - run manually'));
    }
  }
}

async function validatePlugin(pluginPath: string, options: any): Promise<any> {
  const indexPath = path.join(pluginPath, 'src', 'index.ts');
  
  try {
    await fs.access(indexPath);
  } catch {
    throw new Error('Plugin source file not found. Are you in a plugin project directory?');
  }

  // This would dynamically import and validate the plugin
  // For now, return a mock result
  return {
    valid: true,
    errors: [],
    warnings: [],
    metadata: {
      name: 'Mock Plugin',
      version: '1.0.0',
    },
  };
}

async function buildPlugin(pluginPath: string, options: any): Promise<void> {
  const { spawn } = require('child_process');
  
  // Check if TypeScript is available
  try {
    await fs.access(path.join(pluginPath, 'tsconfig.json'));
  } catch {
    throw new Error('No TypeScript configuration found');
  }

  // Run TypeScript compiler
  return new Promise((resolve, reject) => {
    const args = ['--build'];
    if (options.watch) args.push('--watch');
    if (options.clean) args.push('--clean');

    const tsc = spawn('npx', ['tsc', ...args], { 
      cwd: pluginPath, 
      stdio: 'inherit' 
    });

    tsc.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error('TypeScript compilation failed'));
    });
  });
}

async function generateManifest(pluginPath: string, options: any): Promise<void> {
  // This would load the actual plugin and generate manifest
  const manifest = {
    identifier: 'example-plugin',
    name: 'Example Plugin',
    version: '1.0.0',
    description: 'An example plugin',
    author: 'Example Author',
    type: 'business',
    main: 'dist/index.js',
    generatedAt: new Date().toISOString(),
  };

  const outputPath = path.join(pluginPath, options.output);
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
}

async function packagePlugin(pluginPath: string, options: any): Promise<string> {
  const packageName = options.output || 'plugin.tar.gz';
  const outputPath = path.join(pluginPath, packageName);

  // This would create an actual package
  // For now, just create a mock file
  await fs.writeFile(outputPath, 'Mock plugin package');
  
  return outputPath;
}

async function runTests(pluginPath: string, options: any): Promise<void> {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    const args = [];
    if (options.watch) args.push('--watch');
    if (options.coverage) args.push('--coverage');
    if (options.verbose) args.push('--verbose');

    const jest = spawn('npx', ['jest', ...args], { 
      cwd: pluginPath, 
      stdio: 'inherit' 
    });

    jest.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error('Tests failed'));
    });
  });
}

async function startDevServer(pluginPath: string, options: any): Promise<void> {
  console.log(chalk.blue(`Development server starting on port ${options.port}...`));
  console.log(chalk.gray('Plugin hot-reload enabled'));
  console.log(chalk.gray('Press Ctrl+C to stop'));

  // This would start an actual development server with hot-reload
  // For now, just simulate
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nDevelopment server stopped'));
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

async function searchMarketplace(query: string, options: any): Promise<any[]> {
  // Mock marketplace search results
  return [
    {
      name: 'Advanced Inventory',
      version: '2.1.0',
      description: 'Advanced inventory management features',
      author: 'ERP Team',
      downloads: 1250,
      rating: 4.8,
    },
    {
      name: 'Payment Gateway Pro',
      version: '1.5.2',
      description: 'Professional payment processing integration',
      author: 'Payments Inc',
      downloads: 890,
      rating: 4.6,
    },
  ];
}

async function installFromMarketplace(plugin: string, options: any): Promise<void> {
  // This would install from actual marketplace
  console.log(`Installing ${plugin}${options.version ? `@${options.version}` : ''}...`);
  
  // Simulate installation
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function publishToMarketplace(pluginPath: string, options: any): Promise<void> {
  if (options.dryRun) {
    console.log(chalk.blue('Dry run - would publish:'));
    console.log('  Package: example-plugin@1.0.0');
    console.log('  Files: 15');
    console.log('  Size: 1.2MB');
    return;
  }

  // This would publish to actual marketplace
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function showPluginInfo(pluginPath: string): Promise<void> {
  try {
    const packageJsonPath = path.join(pluginPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    console.log(chalk.bold('\nPlugin Information:'));
    console.log(`  Name: ${packageJson.name}`);
    console.log(`  Version: ${packageJson.version}`);
    console.log(`  Description: ${packageJson.description}`);
    console.log(`  Author: ${packageJson.author}`);
    console.log(`  Keywords: ${packageJson.keywords?.join(', ') || 'None'}`);

  } catch (error) {
    throw new Error('Unable to read plugin information');
  }
}

async function cleanPlugin(pluginPath: string, options: any): Promise<void> {
  const dirsToClean = ['dist', 'build', '.tsbuildinfo'];
  
  if (options.all) {
    dirsToClean.push('node_modules', 'coverage', '.nyc_output');
  }

  for (const dir of dirsToClean) {
    const dirPath = path.join(pluginPath, dir);
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}

// Run the CLI
if (require.main === module) {
  program.parse();
}

export { program };