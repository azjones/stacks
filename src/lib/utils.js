import moment from 'moment'
import fs from 'fs'
import path from 'path'
import { TemplateError, StackError } from '../lib/errors'

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
    const exists = await fs.existsSync(path.resolve(process.cwd(), template))
    if (!exists) throw new TemplateError(`${template} not found`)
  } catch (e) {
    throw new TemplateError(e.message)
  }
}

export const extractTemplateName = template => {
  return new Promise((resolve, reject) => {
    return resolve(template.substring(template.lastIndexOf('/') + 1, template.lastIndexOf('.')))
  })
}
