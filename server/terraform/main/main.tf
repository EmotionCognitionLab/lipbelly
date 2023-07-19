terraform {
  backend "s3" {
    bucket = "lipbelly-tf-state"
    region = "us-west-2"
    key = "main"
    workspace_key_prefix = "workspaces"
  }
}

provider "aws" {
    region = var.region
}

# cognito setup
# do not change this without also changing it
# in ../post-lambdas/cognito.tf
resource "aws_cognito_user_pool" "pool" {
    name = "lb-${var.env}-users"
    auto_verified_attributes = [ "email" ]
    password_policy {
      minimum_length = 12
    }
    account_recovery_setting {
      recovery_mechanism {
        name = "verified_email"
        priority = 1
      }
    }
    schema {
      attribute_data_type = "String"
      name = "phone_number"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 12
          max_length = 12
      }
    }
    schema {
      attribute_data_type = "String"
      name = "name"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 1
          max_length = 50
      }
    }
    username_attributes = [ "email" ]
    username_configuration {
      case_sensitive = false
    }
    sms_configuration {
      external_id = "lb-${var.env}-cognito-snscaller"
      sns_caller_arn = aws_iam_role.cognito-sns.arn
    }
}
output "cognito_pool_id" {
    value = aws_cognito_user_pool.pool.id
}

# save user pool arn to SSM so serverless can reference it
resource "aws_ssm_parameter" "cognito-user-pool-arn" {
  name = "/lb/${var.env}/info/cognito/user-pool/arn"
  description = "Cognito user pool ARN"
  type = "SecureString"
  value = "${aws_cognito_user_pool.pool.arn}"
}

# save user pool id to SSM so serverless can reference it
resource "aws_ssm_parameter" "cognito-user-pool-id" {
  name = "/lb/${var.env}/info/cognito/user-pool/id"
  description = "Cognito user pool id"
  type = "SecureString"
  value = "${aws_cognito_user_pool.pool.id}"
}

resource "aws_cognito_user_pool_client" "client" {
    name = "client"
    user_pool_id = aws_cognito_user_pool.pool.id
    generate_secret = false
    allowed_oauth_flows = [ "code", "implicit" ]
    allowed_oauth_flows_user_pool_client = true
    allowed_oauth_scopes = [ "openid", "aws.cognito.signin.user.admin" ]
    callback_urls = "${var.cognito-callback-urls}"
    default_redirect_uri = "${var.cognito-redirect-uri}"
    logout_urls = "${var.cognito-logout-url}"
    supported_identity_providers = [ "COGNITO" ]
    read_attributes = ["email", "name", "phone_number", "phone_number_verified", "email_verified"]
    write_attributes = ["email", "name", "phone_number"]
}
output "cognito_pool_client_id" {
    value = aws_cognito_user_pool_client.client.id
}

# save user pool client id to SSM so serverless can reference it
resource "aws_ssm_parameter" "cognito-user-pool-client-id" {
  name = "/lb/${var.env}/info/cognito/user-pool/client/id"
  description = "Cognito user pool client id"
  type = "SecureString"
  value = "${aws_cognito_user_pool_client.client.id}"
}

resource "aws_cognito_user_pool_domain" "main" {
    domain = "lb-${var.env}"
    user_pool_id = aws_cognito_user_pool.pool.id
}

resource "aws_cognito_identity_pool" "main" {
  allow_classic_flow               = false
  allow_unauthenticated_identities = false
  identity_pool_name               = "lb_${var.env}_id_pool"

  cognito_identity_providers {
      client_id               = "${aws_cognito_user_pool_client.client.id}"
      provider_name           = "${aws_cognito_user_pool.pool.endpoint}"
      server_side_token_check = false
  }
}
output "cognito_identity_pool_id" {
  value = aws_cognito_identity_pool.main.id
}

resource "aws_cognito_user_group" "admin" {
  name = "admin"
  user_pool_id = aws_cognito_user_pool.pool.id
  description = "User group for study administrators"
  precedence = 1
  role_arn = aws_iam_role.study-admin.arn
}

# DynamoDB setup
resource "aws_dynamodb_table" "experiment-data-table" {
  name           = "lb-${var.env}-experiment-data"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "identityId"
  range_key      = "experimentDateTime"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "identityId"
    type = "S"
  }

  attribute {
    name = "experimentDateTime"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name = "userId-experimentDateTime-index"
    hash_key = "userId"
    range_key = "experimentDateTime"
    projection_type = "INCLUDE"
    non_key_attributes = ["identityId"]
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-experiment-data-table" {
  name = "/lb/${var.env}/info/dynamo/table/experiments"
  description = "Dynamo table holding experiment data"
  type = "SecureString"
  value = "${aws_dynamodb_table.experiment-data-table.name}"
}

resource "aws_dynamodb_table" "users-table" {
  name           = "lb-${var.env}-users"
  billing_mode   = "PROVISIONED"
  read_capacity  = 1
  write_capacity = 1
  hash_key       = "userId"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-users-table" {
  name = "/lb/${var.env}/info/dynamo/table/users"
  description = "Dynamo table holding user information"
  type = "SecureString"
  value = "${aws_dynamodb_table.users-table.name}"
}

resource "aws_dynamodb_table" "consent-table" {
  name           = "lb-${var.env}-consent"
  billing_mode   = "PROVISIONED"
  read_capacity  = 1
  write_capacity = 1
  hash_key       = "envelopeId"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "envelopeId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "segments-table" {
  name           = "lb-${var.env}-segments"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "humanId"
  range_key = "endDateTime"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "humanId"
    type = "S"
  }

  attribute {
    name = "endDateTime"
    type = "N"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-segments-table" {
  name = "/lb/${var.env}/info/dynamo/table/segments"
  description = "Dynamo table holding user breathing data"
  type = "SecureString"
  value = "${aws_dynamodb_table.segments-table.name}"
}

resource "aws_dynamodb_table" "earnings-table" {
  name           = "lb-${var.env}-earnings"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "typeDate"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "typeDate"
    type = "S"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "earnings-table" {
  name = "/lb/${var.env}/info/dynamo/table/earnings"
  description = "Dynamo table holding earnings info"
  type = "SecureString"
  value = "${aws_dynamodb_table.earnings-table.name}"
}

resource "aws_dynamodb_table" "emopics-table" {
  name           = "lb-${var.env}-emopics"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "order"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "order"
    type = "N"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "emopics-table" {
  name = "/lb/${var.env}/info/dynamo/table/emopics"
  description = "Dynamo table holding emotional pictures info"
  type = "SecureString"
  value = "${aws_dynamodb_table.emopics-table.name}"
}

# S3 bucket for participant data
resource "aws_s3_bucket" "data-bucket" {
  bucket = "${var.data-bucket}"
}

resource "aws_s3_bucket_versioning" "data-bucket-versioning" {
  bucket = aws_s3_bucket.data-bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# resource "aws_s3_bucket_acl" "data-bucket-acl" {
#   bucket = aws_s3_bucket.data-bucket.id
#   acl = "private"
# }

# IAM policies
resource "aws_iam_policy" "cloudwatch-write" {
  name = "lb-${var.env}-cloudwatch-write"
  path = "/policy/cloudwatch/"
  description = "Allows writing to CloudWatch logs"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Policy to allow authenticated users to write data to
# their own folder
resource "aws_iam_policy" "s3-write-experiment-data" {
  name = "lb-${var.env}-s3-write-experiment-data"
  path = "/policy/s3/experimentData/write/"
  description = "Allows writing data to participant's own s3 folder"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::${var.data-bucket}/$${cognito-identity.amazonaws.com:sub}",
        "arn:aws:s3:::${var.data-bucket}/$${cognito-identity.amazonaws.com:sub}/*"
      ]
    }
  ]
}
POLICY
}

# Policy to allow authenticated users to read data from
# their own folder
resource "aws_iam_policy" "s3-read-experiment-data" {
  name = "lb-${var.env}-s3-read-experiment-data"
  path = "/policy/s3/experimentData/read/"
  description = "Allows reading data from participant's own s3 folder"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::${var.data-bucket}/*/$${cognito-identity.amazonaws.com:sub}",
        "arn:aws:s3:::${var.data-bucket}/*/$${cognito-identity.amazonaws.com:sub}/*"
      ]
    }
  ]
}
POLICY
}

data "aws_caller_identity" "current" {}

# Policy to allow authenticated cognito users to write
# to the experiment data table, but only rows where
# the hash key is their cognito identity id.
resource "aws_iam_policy" "dynamodb-write-experiment-data" {
  name = "lb-${var.env}-dynamodb-write-experiment-data"
  path = "/policy/dynamodb/experimentData/write/"
  description = "Allows writing to Dynamodb experiment data table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.experiment-data-table.name}"
      ],
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": [
            "$${cognito-identity.amazonaws.com:sub}"
          ]
        }
      }
    }
  ]
}
POLICY
}

# policy to allow reading/writing to dynamo
resource "aws_iam_policy" "dynamodb-read-write" {
  name = "lb-${var.env}-dynamodb-read-write"
  path = "/policy/dynamodb/all/"
  description = "Allows reading from/writing to dynamodb tables"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/*"
      ]
    }
  ]
}
POLICY
}

# policy to allow limited reading/writing of dynamo user table
resource "aws_iam_policy" "dynamodb-user-read-write" {
  name = "lb-${var.env}-dynamodb-user-read-write"
  path = "/policy/dynamodb/users/all/"
  description = "Allows limited reading from/writing to dynamodb user table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable",
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:Scan",
        "dynamodb:PutItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.users-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow limited reading of dynamo user table
resource "aws_iam_policy" "dynamodb-user-read" {
  name = "lb-${var.env}-dynamodb-user-read"
  path = "/policy/dynamodb/users/read/all/"
  description = "Allows limited reading from dynamodb user table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.users-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow fetching user ids from dynamo user table
# TODO remove this after refactoring experiment data table to allow query by experiment name
resource "aws_iam_policy" "dynamodb-userid-read" {
  name = "lb-${var.env}-dynamodb-userid-read"
  path = "/policy/dynamodb/users/ids/"
  description = "Allows very limited reading from dynamodb user table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.users-table.name}"
      ],
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:Attributes": [
            "userId", "humanId"
          ]
        },
        "StringEqualsIfExists": {
          "dynamodb:Select": "SPECIFIC_ATTRIBUTES"
        }
      }
    }
  ]
}
POLICY
}

# Policy to allow reading from the segments table
resource "aws_iam_policy" "dynamodb-read-all-segments" {
  name = "lb-${var.env}-dynamodb-read-all-segments"
  path = "/policy/dynamodb/segments/readAll/"
  description = "Allows reading all data from Dynamodb segments table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.segments-table.name}"
      ]
    }
  ]
}
POLICY
}

# Policy to allow writing to the segments table
resource "aws_iam_policy" "dynamodb-write-all-segments" {
  name = "lb-${var.env}-dynamodb-write-all-segments"
  path = "/policy/dynamodb/segments/writeAll/"
  description = "Allows writing to the Dynamodb segments table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.segments-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow reading from/writing to docusign table
resource "aws_iam_policy" "dynamodb-consent-read-write" {
  name = "lb-${var.env}-dynamodb-consent-read-write"
  path = "/policy/dynamodb/ds/all/"
  description = "Allows reading from/writing to dynamodb docusign table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.consent-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow sns publishing
resource "aws_iam_policy" "sns-publish" {
  name = "lb-${var.env}-sns-publish"
  path = "/policy/sns/publish/"
  description = "Allows SNS publishing"
  policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [ "sns:publish" ]
          Resource = [ "*" ]
        }
      ]
    }) 
}

# policy to allow email send via SES
resource "aws_iam_policy" "ses-send" {
  name = "lb-${var.env}-ses-send"
  path = "/policy/ses/send/"
  description = "Allows emails sends via SES"
  policy = jsonencode({
    Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [ "ses:SendEmail", "ses:SendRawEmail" ]
          Resource = [ "*" ]
        }
      ]
  })
}

# policy to allow limited reading of dynamo earnings table
resource "aws_iam_policy" "dynamodb-earnings-read" {
  name = "lb-${var.env}-dynamodb-earnings-read"
  path = "/policy/dynamodb/earnings/read/"
  description = "Allows limited reading from dynamodb earnings table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.earnings-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow limited writing to dynamo earnings table
resource "aws_iam_policy" "dynamodb-earnings-write" {
  name = "lb-${var.env}-dynamodb-earnings-write"
  path = "/policy/dynamodb/earnings/write/"
  description = "Allows limited writing to dynamodb earnings table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.earnings-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow use of SQS queues
resource "aws_iam_policy" "sqs-registration-read-write" {
  name = "lb-${var.env}-registration-sqs-read-write"
  path = "/policy/sqs/registration/all/"
  description = "Allows reading from/writing to the registration and dead letter sqs queues"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [ "sqs:*" ],
      "Resource": [
        "arn:aws:sqs:${var.region}:${data.aws_caller_identity.current.account_id}:${aws_sqs_queue.registration-email.name}",
        "arn:aws:sqs:${var.region}:${data.aws_caller_identity.current.account_id}:${aws_sqs_queue.deadletter.name}"
      ]
    }
  ]
}
POLICY
}

# IAM roles
resource "aws_iam_role" "lambda-sqlite-process" {
  name = "lb-${var.env}-lambda-sqlite-process"
  path = "/role/lambda/sqlite/process/"
  description = "Role for lambda function(s) processing sqlite files uploaded to usr data bucket"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  inline_policy {
    name = "lb-${var.env}-usr-data-bucket-read"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "s3:GetObject"
          ]
          Resource = [
            "${aws_s3_bucket.data-bucket.arn}/*"
          ]
        }
      ]
    })
  }

  managed_policy_arns = [
    aws_iam_policy.cloudwatch-write.arn,
    aws_iam_policy.dynamodb-read-all-segments.arn,
    aws_iam_policy.dynamodb-write-all-segments.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-sqlite-role" {
  name = "/lb/${var.env}/role/lambda/sqlite/process"
  description = "ARN for lambda role to process sqlite files uploaded to usr data bucket"
  type = "SecureString"
  value = "${aws_iam_role.lambda-sqlite-process.arn}"
}

resource "aws_iam_role" "dynamodb-experiment-reader-writer" {
  name = "lb-${var.env}-dynamo-reader-writer"
  path = "/role/user/dynamodb/readwrite/"
  description = "Allows cognito-auth'd users to read and write their own data from/to certain dynamo tables and s3 buckets."
  assume_role_policy    = jsonencode(
      {
          Statement = [
              {
                  Action    = "sts:AssumeRoleWithWebIdentity"
                  Condition = {
                      StringEquals = {
                          "cognito-identity.amazonaws.com:aud" = "${aws_cognito_identity_pool.main.id}"
                      }
                  }
                  Effect    = "Allow"
                  Principal = {
                      Federated = "cognito-identity.amazonaws.com"
                  }
              },
          ]
          Version   = "2012-10-17"
      }
  )
  managed_policy_arns   = [
      aws_iam_policy.s3-write-experiment-data.arn,
      aws_iam_policy.s3-read-experiment-data.arn
  ]
}

resource "aws_iam_role" "unauthenticated" {
  name = "lb-${var.env}-cognito-unauthenticated"
  path = "/role/user/unauthenticated/"
  description = "Minimal role for unauthenticated cognito uesrs"
  assume_role_policy    = jsonencode(
      {
          Statement = [
              {
                  Action    = "sts:AssumeRoleWithWebIdentity"
                  Condition = {
                      StringEquals = {
                          "cognito-identity.amazonaws.com:aud" = "${aws_cognito_identity_pool.main.id}"
                      },
                      "ForAnyValue:StringLike" = {
                        "cognito-identity.amazonaws.com:amr" = "unauthenticated"
                      }
                  }
                  Effect    = "Allow"
                  Principal = {
                      Federated = "cognito-identity.amazonaws.com"
                  }
              },
          ]
          Version   = "2012-10-17"
      }
  )

  inline_policy {
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "mobileanalytics:PutEvents",
            "cognito-sync:*"
          ]
          Resource = [
            "*"
          ]
        }
      ]
    })
  }
}

resource "aws_iam_role" "lambda" {
  name = "lb-${var.env}-lambda"
  path = "/role/lambda/"
  description = "Basic role for running lambda functions"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-user-read-write.arn,
    aws_iam_policy.dynamodb-earnings-read.arn,
    # aws_iam_policy.dynamodb-read-all-experiment-data.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-role" {
  name = "/lb/${var.env}/role/lambda"
  description = "ARN for lambda role"
  type = "SecureString"
  value = "${aws_iam_role.lambda.arn}"
}

resource "aws_iam_role" "lambda-earnings" {
  name = "lb-${var.env}-lambda-earnings"
  path = "/role/lambda/earnings/"
  description = "Role for lambda functions that handle earnings"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-user-read.arn,
    aws_iam_policy.dynamodb-read-all-segments.arn,
    # aws_iam_policy.dynamodb-read-all-experiment-data.arn,
    aws_iam_policy.dynamodb-earnings-read.arn,
    aws_iam_policy.dynamodb-earnings-write.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-earnings-role" {
  name = "/lb/${var.env}/role/lambda/earnings"
  description = "ARN for lambda-earnings role"
  type = "SecureString"
  value = "${aws_iam_role.lambda-earnings.arn}"
}

# Policy for unregistered users for things like screening survey,
# docusign signing of consent form, registration, etc.
resource "aws_iam_role" "lambda-unregistered" {
  name = "lb-${var.env}-lambda-unregistered"
  path = "/role/lambda/unregistered/"
  description = "Role for lambda function that handles unregistered users"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-user-read.arn,
    aws_iam_policy.dynamodb-consent-read-write.arn,
    aws_iam_policy.ses-send.arn,
    aws_iam_policy.sqs-registration-read-write.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-unregistered-role" {
  name = "/lb/${var.env}/role/lambda/unregistered"
  description = "ARN for lambda-unregistered role"
  type = "SecureString"
  value = "${aws_iam_role.lambda-unregistered.arn}"
}

resource "aws_iam_role" "lambda-sqs-process" {
  name = "lb-${var.env}-lambda-sqs-process"
  path = "/role/lambda/sqs/process/"
  description = "Role for lambda function(s) invoked from SQS queues"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns = [aws_iam_policy.cloudwatch-write.arn,
    aws_iam_policy.dynamodb-user-read.arn,
    aws_iam_policy.dynamodb-consent-read-write.arn,
    aws_iam_policy.sqs-registration-read-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-sqs-role" {
  name = "/lb/${var.env}/role/lambda/sqs/process"
  description = "ARN for lambda role to process messages received from SQS"
  type = "SecureString"
  value = "${aws_iam_role.lambda-sqs-process.arn}"
}

resource "aws_iam_role_policy" "lambda-role-assumption" {
  name = "lb-${var.env}-lambda-role-assumption-policy"
  role = aws_iam_role.lambda.name
  policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "sts:AssumeRole"
          ]
          Resource = [
            "${aws_iam_role.study-admin.arn}"
          ]
        }
      ]
    })
}

resource "aws_iam_role" "study-admin" {
  name = "lb-${var.env}-study-admin"
  path = "/role/admin/"
  description = "Role for study administrators"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "${aws_iam_role.lambda.arn}"
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      },
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = [
          "sts:AssumeRoleWithWebIdentity"
        ]
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = "${aws_cognito_identity_pool.main.id}"
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr": "authenticated"
          }
        }
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-read-write.arn, aws_iam_policy.cloudwatch-write.arn
  ]
}

resource "aws_iam_role" "lambda-dynamodb-sns-ses" {
  name = "lb-${var.env}-lambda-dynamodb-sns-ses"
  path = "/role/lambda/dynamodb/sns/ses/"
  description = "Role for lambda functions needing dynamo, sns and ses access"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-read-write.arn,
    aws_iam_policy.sns-publish.arn,
    aws_iam_policy.ses-send.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-dynamodb-sns-ses-role" {
  name = "/lb/${var.env}/role/lambda/dynamodb/sns/ses"
  description = "ARN for lambda role with dynamodb, sns and ses access"
  type = "SecureString"
  value = "${aws_iam_role.lambda-dynamodb-sns-ses.arn}"
}

resource "aws_iam_role" "cognito-sns" {
  name = "lb-${var.env}-cognito-sns"
  path = "/role/cognito/sns/"
  description = "Role to allow cognito to send messages via SNS"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cognito-idp.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
        Condition = {
          StringEquals = {
              "sts:ExternalId" = "lb-${var.env}-cognito-snscaller"
          }
        }
      }
    ]
  })

  managed_policy_arns = [aws_iam_policy.sns-publish.arn]
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated" = aws_iam_role.dynamodb-experiment-reader-writer.arn
    "unauthenticated" = aws_iam_role.unauthenticated.arn
  }
}

# resources for writing console logs to Cloudwatch
resource "aws_iam_user" "console-log-writer" {
  name = "lb-${var.env}-console-log-writer"
}

resource "aws_cloudwatch_log_group" "console-log-group" {
  name = "lb-${var.env}-console"
  retention_in_days = 30
}

resource "aws_iam_policy" "console-log-write" {
  name = "lb-${var.env}-cloudwatch-console-write"
  path = "/policy/cloudwatch/console/"
  description = "Allows writing to specific CloudWatch log group"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [ "${aws_cloudwatch_log_group.console-log-group.arn}:*:*" ]
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "console-log-writer-policy" {
  user = aws_iam_user.console-log-writer.name
  policy_arn = aws_iam_policy.console-log-write.arn
}


resource "aws_iam_access_key" "console-log-writer-key" {
  user = aws_iam_user.console-log-writer.name
}

output "console_log_writer_id" {
  value = aws_iam_access_key.console-log-writer-key.id
}

resource "aws_cloudwatch_log_metric_filter" "console-error" {
  name = "lb-${var.env}-console-error"
  pattern = "error"
  log_group_name = aws_cloudwatch_log_group.console-log-group.name

  metric_transformation {
    name = "lb-${var.env}-console-error-count"
    namespace = "LogMetrics"
    value = "1"
  }
}

# provisioner is used b/c trying to set up an email
# subscription to an sns topic via aws_sns_topic_subscription
# fails with:
# error creating SNS topic subscription: InvalidParameter: Invalid parameter: Email address
# provisioner will only run when the topic is first created
# and will *not* update the subscriptions when var.console-error-notification-emails
# is changed
# https://medium.com/@raghuram.arumalla153/aws-sns-topic-subscription-with-email-protocol-using-terraform-ed05f4f19b73
# https://github.com/rarumalla1/terraform-projects/tree/master/aws-sns-email-subscription-terraform-using-command
# TODO rename this just "errors" - it's used for multiple errors sources, not just console
resource "aws_sns_topic" "console-errors" {
  name = "lb-${var.env}-console-errors-topic"
  provisioner "local-exec" {
    command = "/usr/bin/env bash sns-subscription.sh"
    environment = {
      sns_arn = self.arn
      sns_emails = var.console-error-notification-emails
     }
  }
}

resource "aws_cloudwatch_metric_alarm" "console-error-alarm" {
  alarm_name = "lb-${var.env}-console-error-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 1
  period = 300
  metric_name = "lb-${var.env}-console-error-count"
  namespace = "LogMetrics"
  statistic = "Sum"
  threshold = 0
  alarm_actions = [aws_sns_topic.console-errors.arn]
  datapoints_to_alarm = 1
  treat_missing_data = "notBreaching"
}

# SQS dead-letter queue
resource "aws_sqs_queue" "deadletter" {
  name = "lb-${var.env}-deadletter-queue"
}

resource "aws_sqs_queue_redrive_allow_policy" "deadletter" {
  queue_url = aws_sqs_queue.deadletter.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue",
    sourceQueueArns = [aws_sqs_queue.registration-email.arn]
  })
}

# SQS queue used to send emails to participants who have signed
# the study consent form but not yet registered. It has a five-minute
# delay, after which it triggers a lambda function that checks to see
# if the participant has already registered and, if not, emails them
# instructions to do so.
resource "aws_sqs_queue" "registration-email" {
  name = "lb-${var.env}-registration-email-queue"
  delay_seconds = 300
  max_message_size = 2048
  message_retention_seconds = 86400
  receive_wait_time_seconds = 20
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.deadletter.arn
    maxReceiveCount = 4
  })
}

# save above SQS queue url and arn to SSM so serverless can reference them
resource "aws_ssm_parameter" "sqs-registration-email-queue-url" {
  name = "/lb/${var.env}/sqs/registration/url"
  description = "URL for registration email SQS queue"
  type = "SecureString"
  value = "${aws_sqs_queue.registration-email.url}"
}

resource "aws_ssm_parameter" "sqs-registration-email-queue-arn" {
  name = "/lb/${var.env}/sqs/registration/arn"
  description = "ARN for registration email SQS queue"
  type = "SecureString"
  value = "${aws_sqs_queue.registration-email.arn}"
}

# Cloudwatch alarm for the deadletter queue
resource "aws_cloudwatch_metric_alarm" "deadletter-queue-alarm" {
  alarm_name = "lb-${var.env}-deadletter-queue-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 1
  period = 300
  metric_name = "ApproximateNumberOfMessagesVisible"
  namespace = "AWS/SQS"
  statistic = "Sum"
  threshold = 0
  alarm_actions = [aws_sns_topic.console-errors.arn]
  datapoints_to_alarm = 1
  treat_missing_data = "notBreaching"
  dimensions = {
    "QueueName" = "${aws_sqs_queue.deadletter.name}"
  }
}
