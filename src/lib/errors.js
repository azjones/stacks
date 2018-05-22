export class TemplateError extends Error {
  constructor(...args) {
    super(...args)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class StackError extends Error {
  constructor(...args) {
    super(...args)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class UploadError extends Error {
  constructor(...args) {
    super(...args)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}
