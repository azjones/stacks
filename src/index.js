import program from 'commander'
import AWS from 'aws-sdk'
import chalk from 'chalk'
import { parseParams, now, getAccountId, getBucketName, stackExists, templateExists } from './lib/utils'
import Stack from './lib/Stack'
import { StackError } from './lib/errors'

const log = console.log

let profile
let region
let bucket
let stack
let params

program
  .version('1.3.0')
  .option('-p, --profile [default]', 'AWS profile', 'default')
  .option('-r, --region [us-west-2]', 'AWS region', 'us-west-2')

program
  .command('deploy [template]')
  .option('-n, --name [name]', 'Stack name', 'devops')
  .option('-P, --params [params]', 'List of params', parseParams)
  .action(async (template, options) => {
    profile = options.parent.profile
    region = options.parent.region
    stack = options.name
    params = options.params || []
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    log(chalk.cyanBright('Stack Name:'), stack)
    log(chalk.cyanBright('Stack Parameters:'), params)
    log(chalk.cyanBright('Template:'), template)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      await templateExists(template)
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
            template
          })
    } catch (e) {
      log(chalk.gray(now()), chalk.red(e))
    }
  })

program
  .command('delete [stack]')
  .description('deletes the stack')
  .action(async (stack, options) => {
    profile = options.parent.profile
    region = options.parent.region
    log(chalk.cyanBright('AWS Profile:'), profile)
    log(chalk.cyanBright('AWS Region:'), region)
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile })
    AWS.config.update({ region })
    try {
      if (!(await stackExists(AWS, stack))) {
        throw new StackError(`${stack} does not exist`)
      }
      Stack.delete(AWS, {
        profile,
        region,
        stack
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

program.parse(process.argv)
