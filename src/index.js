import program from 'commander'
import AWS from 'aws-sdk'
import chalk from 'chalk'
import {
  parseParams,
  now,
  getAccountId,
  getBucketName,
  stackExists,
  templateExists,
  directoryExists,
  extractTemplateName
} from './utils'
import Stack from './lib/Stack'
import { StackError } from './errors'
import pkg from '../package.json'

const log = console.log

let profile
let region
let bucket
let stack
let params
let protect

program
  .version(pkg.version)
  .option('-p, --profile <default>', 'aws profile', 'default')
  .option('-r, --region <us-west-2>', 'aws region', 'us-west-2')

program
  .command('deploy [template] [name]')
  .description('deploys a stack')
  .option('--params <params>', 'list of params', parseParams)
  .option('--protect', 'enable termination protection')
  .action(async (template, name, options) => {
    profile = options.parent.profile
    region = options.parent.region
    params = options.params || []
    protect = options.protect || false
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    log(chalk.cyanBright('Stack Parameters:'), params)
    log(chalk.cyanBright('Template:'), template)
    log(chalk.cyanBright('Termination Protection:'), protect)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      await templateExists(template)
      stack = name || (await extractTemplateName(template))
      log(chalk.cyanBright('Stack Name:'), stack)
      bucket = await getBucketName(AWS)
      log(chalk.cyanBright('Bucket:'), bucket)
      await Stack.upload(AWS, {
        template,
        region,
        bucket
      })
      ;(await stackExists(AWS, stack))
        ? Stack.update(AWS, {
            stack,
            params,
            region,
            bucket,
            template
          })
        : Stack.create(AWS, {
            stack,
            params,
            region,
            bucket,
            template,
            protect
          })
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('delete [name]')
  .description('deletes the stack')
  .action(async (name, options) => {
    profile = options.parent.profile
    region = options.parent.region
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      if (!(await stackExists(AWS, name))) {
        throw new StackError(`${name} does not exist`)
      }
      Stack.delete(AWS, {
        profile,
        region,
        name
      })
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('list [type]')
  .description('list active stacks')
  .action(async (type, options) => {
    profile = options.parent.profile
    region = options.parent.region
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      switch (type) {
        case 'exports':
          {
            await Stack.listAllExports(AWS)
          }
          break
        case 'stacks':
        default:
          {
            await Stack.listAllStacks(AWS)
          }
          break
      }
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('upload [template]')
  .description('uploads template to bucket')
  .option('--dir', 'Is a directory')
  .action(async (template, options) => {
    profile = options.parent.profile
    region = options.parent.region
    const dir = options.dir || false
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      if (dir) {
        log(chalk.cyanBright('Template Directory:'), template)
        await directoryExists(template)
      } else {
        log(chalk.cyanBright('Template:'), template)
        await templateExists(template)
      }
      bucket = await getBucketName(AWS)
      log(chalk.cyanBright('Bucket:'), bucket)
      await Stack.upload(AWS, {
        template,
        region,
        bucket
      })
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('account')
  .description('show account information')
  .action(async options => {
    profile = options.parent.profile
    region = options.parent.region
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      await Stack.account(AWS)
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('validate [template]')
  .description('validates the template')
  .action(async (template, options) => {
    profile = options.parent.profile
    region = options.parent.region
    params = options.params || []
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    log(chalk.cyanBright('Template:'), template)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      await templateExists(template)
      await Stack.validate(AWS, template)
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('certs')
  .description('lists ssl certificates')
  .action(async options => {
    profile = options.parent.profile
    region = options.parent.region
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), 'us-east-1', chalk.gray.italic('certs are in us-east-1'))
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      await Stack.listCerts(AWS, region)
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program.parse(process.argv)

process.on('exit', code => log())
