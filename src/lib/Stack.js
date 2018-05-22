import chalk from 'chalk'
import { forEach, sortBy } from 'lodash'
import moment from 'moment'
import { now } from './utils'
import { UploadError } from './errors'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const log = console.log
const colorMap = {
  CREATE_IN_PROGRESS: 'gray',
  CREATE_COMPLETE: 'green',
  CREATE_FAILED: 'red',
  DELETE_IN_PROGRESS: 'gray',
  DELETE_COMPLETE: 'green',
  DELETE_FAILED: 'red',
  ROLLBACK_FAILED: 'red',
  ROLLBACK_IN_PROGRESS: 'yellow',
  ROLLBACK_COMPLETE: 'red',
  UPDATE_IN_PROGRESS: 'gray',
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
let displayedEvents = {}

export default class Stack {
  /**
   * @public
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
    cf
      .createStack({
        StackName: stack,
        OnFailure: 'DELETE',
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        Parameters: params,
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
   * @public
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
   * @public
   * @param {Object} AWS
   */
  static async list(AWS) {
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
            'DELETE_IN_PROGRESS'
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
        log(chalk.gray('StackName:'), chalk.cyan.bold(stack.StackName))
        log(chalk.gray('Description:'), stack.TemplateDescription || '')
        log(chalk.gray('CreationTime:'), moment(stack.CreationTime).format('MMMM Do YYYY, h:mm:ss a'))
        if (stack.LastUpdatedTime) {
          log(chalk.gray('LastUpdatedTime:'), moment(stack.LastUpdatedTime).format('MMMM Do YYYY, h:mm:ss a'))
        }
        log(chalk.gray('StackStatus:'), chalk[colorMap[stack.StackStatus]](stack.StackStatus))
      })
      return stacks
    })
  }
  /**
   * @public
   * @param {Object} AWS
   * @param {Object} options
   */
  static delete(AWS, options) {
    cf = new AWS.CloudFormation()
    stack = options.stack
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
   * @public
   * @param {Object} AWS
   * @param {Object} options
   */
  static async upload(AWS, options) {
    s3 = new AWS.S3()
    region = options.region
    bucket = options.bucket
    template = options.template.substring(options.template.lastIndexOf('/') + 1)
    try {
      if (!(await Stack.bucketExists(bucket))) {
        await s3
          .createBucket({
            Bucket: bucket,
            CreateBucketConfiguration: {
              LocationConstraint: region
            }
          })
          .promise()
      }
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
   * @private
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
              event.ResourceStatus ? chalk[colorMap[event.ResourceStatus]](event.ResourceStatus) : '',
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
   * @private
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
   * @private
   * @param {String} Bucket
   */
  static async bucketExists(Bucket) {
    try {
      await s3
        .headBucket({
          Bucket
        })
        .promise()
      return true
    } catch (e) {
      return false
    }
  }
}
