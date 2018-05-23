import moment from 'moment'
import { existsSync, lstatSync } from 'fs'
import path from 'path'
import { TemplateError, StackError } from '../errors'

export const parseParams = val => {
  let list = val.split(',')
  let params = []
  list.forEach(element => {
    let keyValue = element.split('=')
    params.push({
      ParameterKey: keyValue[0],
      ParameterValue: keyValue[1]
    })
  })
  return params
}

export const now = () => {
  return new moment().format('HH:mm:ss')
}

export const getAccountId = async AWS => {
  const iam = new AWS.IAM()
  try {
    const user = await iam
      .getAccountAuthorizationDetails({
        Filter: ['User']
      })
      .promise()
    return user.UserDetailList[0].Arn.split(':')[4]
  } catch (e) {
    return e
  }
}
export const bucketExists = async (AWS, Bucket) => {
  const s3 = new AWS.S3()
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

export const getBucketName = async AWS => {
  const aid = await getAccountId(AWS)
  return `cf-templates-${aid}-${AWS.config.region}`
}

export const stackExists = async (AWS, stack) => {
  if (!stack) throw new StackError('Missing [stack] argument')
  const cf = new AWS.CloudFormation()
  try {
    const exists = await cf
      .describeStacks({
        StackName: stack
      })
      .promise()
    return true
  } catch (e) {
    return false
  }
}

export const templateExists = async template => {
  try {
    const exists = await existsSync(path.resolve(process.cwd(), template))
    if (!exists) {
      throw new TemplateError(`${template} not found`)
    } else if (lstatSync(template).isDirectory()) {
      throw new TemplateError(`${template} is a directory, use --dir`)
    }
  } catch (e) {
    throw new TemplateError(e.message)
  }
}

export const directoryExists = async directory => {
  try {
    const exists = await existsSync(path.resolve(process.cwd(), directory))
    if (!exists) {
      throw new TemplateError(`${directory} not found`)
    } else if (!lstatSync(directory).isDirectory()) {
      throw new TemplateError(`${directory} is a file, remove --dir`)
    }
  } catch (e) {
    throw new TemplateError(e.message)
  }
}

export const extractTemplateName = template => {
  return new Promise((resolve, reject) => {
    return resolve(template.substring(template.lastIndexOf('/') + 1, template.lastIndexOf('.')))
  })
}
