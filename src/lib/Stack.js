import chalk from 'chalk'
import moment from 'moment'
import { forEach, sortBy, filter } from 'lodash'
import { readFileSync, readdirSync, lstatSync } from 'fs'
import { resolve } from 'path'
import { safeLoad } from 'js-yaml'
import { schema } from 'yaml-cfn'
import { now, bucketExists } from '../utils'
import { UploadError, AccountError, CertificateError } from '../errors'

const log = console.log
const colorMap = {
  CREATE_IN_PROGRESS: 'yellowBright',
  CREATE_COMPLETE: 'green',
  CREATE_FAILED: 'red',
  DELETE_IN_PROGRESS: 'redBright',
  DELETE_COMPLETE: 'green',
  DELETE_FAILED: 'red',
  DELETE_SKIPPED: 'yellow',
  ROLLBACK_FAILED: 'red',
  ROLLBACK_IN_PROGRESS: 'yellow',
  ROLLBACK_COMPLETE: 'red',
  UPDATE_IN_PROGRESS: 'yellowBright',
  UPDATE_COMPLETE: 'green',
  UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: 'green',
  UPDATE_ROLLBACK_IN_PROGRESS: 'yellow',
  UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS: 'yellow',
  UPDATE_ROLLBACK_FAILED: 'red',
  UPDATE_ROLLBACK_COMPLETE: 'green',
  UPDATE_FAILED: 'red'
}

let interval
let startedAt
let cf
let s3
let region
let bucket
let stack
let template
let params
let protect
let displayedEvents = {}

export default class Stack {
  /**
   * @public Creates a stack
   * @param {Object} AWS
   * @param {Object} options
   */
  static create(AWS, options) {
    cf = new AWS.CloudFormation()
    stack = options.stack
    template = options.template.substring(options.template.lastIndexOf('/') + 1)
    params = options.params
    bucket = options.bucket
    region = options.region
    protect = options.protect
    cf
      .createStack({
        StackName: stack,
        OnFailure: 'DELETE',
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        Parameters: params,
        EnableTerminationProtection: protect,
        TemplateURL: `https://s3-${options.region}.amazonaws.com/${options.bucket}/${template}`
      })
      .promise()
      .then(data => {
        log(chalk.gray(now()), 'StackId', chalk.cyan(stack), data.StackId)
        startedAt = Date.now()
        interval = setInterval(() => {
          Stack.checkStatus('Creating')
        }, 5000)
        cf
          .waitFor('stackCreateComplete', {
            StackName: stack
          })
          .promise()
          .then(data => {
            clearInterval(interval)
          })
          .catch(e => {
            clearInterval(interval)
            log(chalk.gray(now()), chalk.red(e))
          })
      })
      .catch(e => {
        log(chalk.gray(now()), chalk.red(e))
      })
  }
  /**
   * @public Updates a stack
   * @param {Object} AWS
   * @param {Object} options
   */
  static update(AWS, options) {
    cf = new AWS.CloudFormation()
    stack = options.stack
    template = options.template.substring(options.template.lastIndexOf('/') + 1)
    params = options.params
    bucket = options.bucket
    region = options.region
    cf
      .updateStack({
        StackName: stack,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        Parameters: params,
        TemplateURL: `https://s3-${region}.amazonaws.com/${bucket}/${template}`
      })
      .promise()
      .then(data => {
        log(chalk.gray(now()), 'StackId', chalk.cyan(stack), data.StackId)
        startedAt = Date.now()
        interval = setInterval(() => {
          Stack.checkStatus('Updating')
        }, 5000)
        cf
          .waitFor('stackUpdateComplete', {
            StackName: stack
          })
          .promise()
          .then(data => {
            clearInterval(interval)
          })
          .catch(e => {
            clearInterval(interval)
            log(chalk.gray(now()), chalk.red(e))
          })
      })
      .catch(e => {
        log(chalk.gray(now()), chalk.red(e))
      })
  }
  /**
   * @public Lists all CloudFormation exports
   * @param {Object} AWS
   */
  static async listAllExports(AWS) {
    cf = new AWS.CloudFormation()
    let exports = []
    let next
    function listExports() {
      return cf
        .listExports({
          NextToken: next
        })
        .promise()
        .then(data => {
          next = (data || {}).NextToken
          exports = exports.concat(data.Exports)
          return !next ? Promise.resolve() : listExports()
        })
        .catch(e => {})
    }
    return listExports().then(() => {
      forEach(exports, exprt => {
        log()
        log(chalk.cyanBright('Export Name:'), chalk.yellow(exprt.Name))
        log(chalk.cyanBright('Export Value:'), exprt.Value)
        log(chalk.cyanBright('Exporting Stack Name:'), exprt.ExportingStackId.split('/')[1])
        log(chalk.cyanBright('Exporting Stack ID:'), exprt.ExportingStackId.split('/')[2])
      })
      return exports
    })
  }
  /**
   * @public Lists all s3 buckets
   * @param {Object} AWS
   */
  static async listBuckets(AWS) {
    const s3 = new AWS.S3()
    try {
      const buckets = await s3.listBuckets().promise()
      log(chalk.cyanBright('Buckets Owner:'), buckets.Owner.DisplayName)
      forEach(buckets.Buckets, bucket => {
        log()
        log(chalk.cyanBright('Bucket:'), chalk.yellow(bucket.Name))
        log(
          chalk.cyanBright('CreationDate:'),
          moment(bucket.CreationDate).format('MMMM Do YYYY, h:mm:ss a')
        )
      })
    } catch (e) {
      throw new Error(e.message)
    }
  }
  /**
   * @public Lists all CloudFormation stacks
   * @param {Object} AWS
   */
  static async listAllStacks(AWS) {
    cf = new AWS.CloudFormation()
    let stacks = []
    let next
    function listStacks() {
      return cf
        .listStacks({
          NextToken: next,
          StackStatusFilter: [
            'CREATE_COMPLETE',
            'UPDATE_ROLLBACK_COMPLETE',
            'UPDATE_COMPLETE',
            'DELETE_FAILED',
            'DELETE_IN_PROGRESS',
            'CREATE_IN_PROGRESS',
            'CREATE_FAILED',
            'ROLLBACK_IN_PROGRESS',
            'ROLLBACK_FAILED',
            'DELETE_IN_PROGRESS',
            'UPDATE_IN_PROGRESS',
            'REVIEW_IN_PROGRESS'
          ]
        })
        .promise()
        .then(data => {
          next = (data || {}).NextToken
          stacks = stacks.concat(data.StackSummaries)
          return !next ? Promise.resolve() : listStacks()
        })
        .catch(e => {})
    }
    return listStacks().then(() => {
      forEach(stacks, stack => {
        log()
        log(chalk.cyanBright('StackName:'), chalk.yellow(stack.StackName))
        log(chalk.cyanBright('Description:'), stack.TemplateDescription || '')
        log(
          chalk.cyanBright('CreationTime:'),
          moment(stack.CreationTime).format('MMMM Do YYYY, h:mm:ss a')
        )
        if (stack.LastUpdatedTime) {
          log(
            chalk.cyanBright('LastUpdatedTime:'),
            moment(stack.LastUpdatedTime).format('MMMM Do YYYY, h:mm:ss a')
          )
        }
        log(chalk.cyanBright('StackStatus:'), chalk[colorMap[stack.StackStatus]](stack.StackStatus))
      })
      return stacks
    })
  }
  /**
   * @public Deletes a stack
   * @param {Object} AWS
   * @param {Object} options
   */
  static delete(AWS, options) {
    cf = new AWS.CloudFormation()
    stack = options.name
    cf
      .deleteStack({
        StackName: stack
      })
      .promise()
      .then(data => {
        startedAt = Date.now()
        interval = setInterval(() => {
          Stack.checkStatus('Deleting')
        }, 5000)
        cf
          .waitFor('stackDeleteComplete', {
            StackName: stack
          })
          .promise()
          .then(data => {
            clearInterval(interval)
            log(
              chalk.gray(now()),
              'Deleting',
              chalk.cyan(stack),
              'AWS::CloudFormation::Stack',
              stack,
              chalk.green('DELETE_COMPLETE')
            )
          })
          .catch(e => {
            clearInterval(interval)
            log(chalk.gray(now()), chalk.red(e))
          })
      })
  }
  /**
   * @public Uploads a template to s3
   * @param {Object} AWS
   * @param {Object} options
   */
  static async upload(AWS, options) {
    s3 = new AWS.S3()
    region = options.region
    bucket = options.bucket
    template = options.template
    try {
      if (!(await bucketExists(AWS, bucket))) {
        await s3
          .createBucket({
            Bucket: bucket,
            CreateBucketConfiguration: {
              LocationConstraint: region
            }
          })
          .promise()
      }
      if (lstatSync(template).isDirectory()) {
        await Stack.uploadDirectory(AWS, {
          bucket,
          template
        })
      } else {
        await Stack.uploadTemplate(AWS, {
          bucket,
          template
        })
      }
    } catch (e) {
      throw new UploadError(e.message)
    }
  }
  /**
   * @public Provides users AWS account information
   * @param {Object} AWS
   */
  static async account(AWS) {
    const iam = new AWS.IAM()
    try {
      const user = await iam
        .getAccountAuthorizationDetails({
          Filter: ['User']
        })
        .promise()
      const details = user.UserDetailList[0]
      log(chalk.cyanBright('UserName:'), details.UserName)
      log(chalk.cyanBright('AccessToken:'), details.UserId)
      log(chalk.cyanBright('AccountId:'), details.Arn.split(':')[4])
      log(chalk.cyanBright('Arn:'), details.Arn)
      log(chalk.cyanBright('GroupList:'), details.GroupList)
      log(chalk.cyanBright('AttachedManagedPolicies:'), details.AttachedManagedPolicies)
      log(
        chalk.cyanBright('CreateDate:'),
        moment(details.CreateDate).format('MMMM Do YYYY, h:mm:ss a')
      )
    } catch (e) {
      throw new AccountError(e.message)
    }
  }
  /**
   * @public Validates a template
   * @param {Object} AWS
   * @param {String} template
   */
  static async validate(AWS, template) {
    const cf = new AWS.CloudFormation()
    try {
      const tmpl = safeLoad(readFileSync(template, 'utf8'), { schema: schema })
      const valid = await cf
        .validateTemplate({
          TemplateBody: JSON.stringify(tmpl)
        })
        .promise()
      if (valid != null) {
        log(chalk.greenBright('Valid Template!'), template.substring(template.lastIndexOf('/') + 1))
      } else {
        log(chalk.redBright('Invalid Template!'), template.substring(template.lastIndexOf('/') + 1))
      }
    } catch (e) {
      throw new Error(e.message)
    }
  }
  /**
   * @public Lists ssl certificates
   * @param {Object} AWS
   * @param {String} region
   */
  static async listCerts(AWS, region) {
    AWS.config.update({ region: 'us-east-1' })
    const acm = new AWS.ACM()
    try {
      const certs = await acm
        .listCertificates({
          CertificateStatuses: [
            'VALIDATION_TIMED_OUT',
            'PENDING_VALIDATION',
            'EXPIRED',
            'INACTIVE',
            'ISSUED',
            'FAILED',
            'REVOKED'
          ]
        })
        .promise()
      certs.CertificateSummaryList.forEach(cert => {
        log()
        log(chalk.cyanBright('DomainName:'), chalk.yellow(cert.DomainName))
        log(chalk.cyanBright('CertificateArn:'), cert.CertificateArn)
      })
    } catch (e) {
      throw new CertificateError(e.message)
    } finally {
      AWS.config.update({ region })
    }
  }
  /**
   * @private Checks the status of stack progress
   * @param {String} action
   */
  static checkStatus(action) {
    let events = []
    return Stack.getAllStackEvents()
      .then(allEvents => {
        forEach(allEvents, event => {
          if (displayedEvents[event.EventId]) return
          events.push(event)
        })
        events = sortBy(events, 'Timestamp')
        forEach(events, event => {
          displayedEvents[event.EventId] = true
          if (moment(event.Timestamp).valueOf() >= startedAt) {
            log(
              chalk.gray(moment(event.Timestamp).format('HH:mm:ss')),
              action,
              chalk.cyan(stack),
              event.ResourceType,
              event.LogicalResourceId,
              event.ResourceStatus
                ? chalk[colorMap[event.ResourceStatus]](event.ResourceStatus)
                : '',
              event.ResourceStatusReason || ''
            )
          }
        })
      })
      .catch(e => {
        log(chalk.gray(now()), e)
      })
  }
  /**
   * @private Gets all stack progress events
   */
  static getAllStackEvents() {
    let next
    let allEvents = []
    function getStackEvents() {
      return cf
        .describeStackEvents({
          StackName: stack,
          NextToken: next
        })
        .promise()
        .then(data => {
          next = (data || {}).NextToken
          allEvents = allEvents.concat(data.StackEvents)
          return !next ? Promise.resolve() : getStackEvents()
        })
        .catch(e => {
          return e
        })
    }
    return getStackEvents().then(() => {
      return allEvents
    })
  }
  /**
   * @private Uploads a single template file
   * @param {Object} AWS
   * @param {Obejct} options
   */
  static async uploadTemplate(AWS, options) {
    const s3 = new AWS.S3()
    bucket = options.bucket
    template = options.template.substring(options.template.lastIndexOf('/') + 1)
    try {
      const file = readFileSync(resolve(process.cwd(), options.template))
      await s3
        .putObject({
          Bucket: bucket,
          Key: template,
          Body: Buffer.from(file)
        })
        .promise()
      log(
        chalk.gray(now()),
        'Uploading',
        chalk.cyan(template),
        `s3://${bucket}/${template}`,
        chalk.green('UPLOAD_COMPLETE')
      )
    } catch (e) {
      throw new UploadError(e.message)
    }
  }
  /**
   * @private Uploads a directory of template files
   * @param {Object} AWS
   * @param {Obejct} options
   */
  static async uploadDirectory(AWS, options) {
    const s3 = new AWS.S3()
    bucket = options.bucket
    try {
      const dir = resolve(process.cwd(), options.template)
      const files = readdirSync(resolve(process.cwd(), options.template))
      const templates = filter(files, file => /[^\s](yml|yaml)$/.test(file))
      await templates.map(async template => {
        const file = readFileSync(resolve(dir, template))
        await s3
          .putObject({
            Bucket: bucket,
            Key: template,
            Body: Buffer.from(file)
          })
          .promise()
        log(
          chalk.gray(now()),
          'Uploading',
          chalk.cyan(template),
          `s3://${bucket}/${template}`,
          chalk.green('UPLOAD_COMPLETE')
        )
      })
      return
    } catch (e) {
      throw new UploadError(e.message)
    }
  }
}
