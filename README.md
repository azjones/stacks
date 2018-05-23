# Stacks

AWS CloudFormation stack command line management tool

## Requirements

* An AWS account
* Node.js version 8+

**Warning**: Using this tool to deploy templates that are successfully created will result in **service charges**. Please be aware of what you are doing before doing it. You've been warned.

## Install

Clone the repository, currently I am not providing this as a package, though I may do so in the future.

```bash
$ git clone https://github.com/azjones/stacks.git
```

Install as global link. This will make bin/stacks available in PATH

```bash
$ cd stacks
$ npm link
```

If you wish to make changes, prior to doing so, you will need to install dependencies

```bash
$ npm i
```

And if you do make changes, make sure to rebuild the bin.

```bash
$ npm run build
```

## Uninstall

```bash
$ npm uninstall -g stacks
```

## Usage

You refer to the program as either `stacks` or `stx`. Currently you are able to `deploy`, `delete`, `list`, `upload`, `validate`, `certs` and `account`. All commands are easy to use. But if you need help, simply `$ stacks -h`.

```
  Usage: stacks [options] [command]

  Options:

    -V, --version                       output the version number
    -p, --profile <default>             aws profile (default: default)
    -r, --region <us-west-2>            aws region (default: us-west-2)
    -h, --help                          output usage information

  Commands:

    deploy [options] [template] [name]  deploys a stack
    delete [name]                       deletes the stack
    list [type]                         list active stacks
    upload [options] [template]         uploads template to bucket
    account                             show account information
    validate [template]                 validates the template
    certs                               lists ssl certificates
```

### Default parameters

There are two default options, `-p, --profile` and `-r, --region`. The profile option defaults to your AWS `[default]` credential located in `~/.aws/credentials`. The region option defaults to `us-west-2` and currently is not pulled from `~/.aws/config`. This needs to be fixed, currently the `aws-sdk` package does not import the region value expressed in its config as it should. So I explicitly configure it here.

### Deploying a CloudFormation template

Deploying a template is easy. Simply tell `stacks` to `deploy`, and point to a file somewhere on your machine. Currently `stacks` only supports `*.yml and *.yaml` files. The `deploy` command has 2 options, `--params` and `--protect`. The params option takes a list of CloudFormation parameters defined by key-value pairs separated by a comma, like `ParamOne=some-value,ParamTwo=anotherValue`. The protect option is a boolean that defaults to false. If you pass `--protect` you are telling stacks to make the template you are cloud forming to be protected from accidental deletion.

The following are possible ways to use `stacks deploy`

```bash
$ stacks deploy ../templates/vpc.yml --protect --params Cidr=10.1.0.0/16
```

```bash
$ stacks deploy ./ec2.yml
```

If you wish to deploy a template to an AWS environment other than your default, you can simply pass the `-p, --profile` and/or `-r, --region` options. Where `prd` is a profile type in your `~/.aws/credentials`

```bash
$ stacks deploy ~/Projects/cloudapp/templates/api.yml -p prd -r us-east-1
```

You may also name your stacks other than the name of the file you pass it. In the above examples, your stack names would be `vpc` and `ec2` respectively. But you can also pass a name argument, in this case the name of the stack will be `cognito`.

```bash
$ stacks deploy ../template/usermanagement.yaml cognito --protect --params AuthName=test -p stage
```

### Deleting a CloudFormation template

Deleting a template is easier than deploying it! Just tell `stacks` to `delete` and pass the name of the stack.

```bash
$ stacks delete cognito
```

If you need to delete a stack from an environment other than your default, simply pass the profile.

```bash
$ stacks delete cognito -p stage
```

### Listing stacks or exports

With the list command, you can list stacks or exports. Simply pass either `stacks` or `exports` in the command. You can list stacks.

```bash
$ stacks list
```

or

```bash
$ stacks list stacks
```

Or you can list exports

```bash
$ stacks list exports
```

And of course you can list stacks or exports in different environments.

```bash
$ stacks list exports -p stage
```

### Uploading templates

You can upload single templates or you upload entire directories of templates with stacks. Uploading entire directories may be useful for those who use nested stacks in their deployments. And require multiple stack templates to exist in the s3 bucket prior to `stacks deploy`.

By default, if you are looking to only deploy a single template file, you do not need to upload first, the `stacks deploy` command will handle that for you. However if you wish to put templates files out on to s3 for _safe keeping_ the upload command would be a nice option. If you require nested templates to exist prior to deploy, you may upload them _one-by-one_.

```bash
$ stacks upload ./nestedTemplate.yml
$ stacks upload ./anotherTemplate.yml
```

If you wish to simply upload the directory of templates, simply point to a directory and pass the `--dir` option.

```bash
$ stacks upload ../cloudformation/templates/ --dir
```

### Showing AWS account information

If you need a quick reference to some of the basic account information provided to you from AWS, you can:

```bash
$ stacks account
```

And with all the commands, you can pass the profile option.

### Validating a template

If you aren't confident the template you are about to deploy is valid, you can have stacks validate it.

```bash
$ stacks validate ~/Projects/cloudapp/templates/sql.yaml
```

### Looking up account ssl certificates

Some stacks require you pass a `CertificateArn`, namely, a `AWS::CloudFront::Distribution` stack. You can use stacks to quickly look up available certificates.

```bash
$ stacks certs
```

## License

MIT
