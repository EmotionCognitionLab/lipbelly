# # This is set in ../../lambdas/serverless.yml
# data "aws_cloudwatch_log_group" "earnings-logs" {
#     name = "/aws/lambda/lb-${var.env}-earnings"
# }

# resource "aws_cloudwatch_log_metric_filter" "earnings-timeout" {
#   name = "lb-${var.env}-earnings-timeout"
#   pattern = "Task timed out"
#   log_group_name = data.aws_cloudwatch_log_group.earnings-logs.name

#   metric_transformation {
#     name = "lb-${var.env}-earnings-timeout-count"
#     namespace = "LogMetrics"
#     value = "1"
#   }
# }

# # This is set in ../main/main.terraform 
# data "aws_sns_topic" "console-errors" {
#     name = "lb-${var.env}-console-errors-topic"
# }

# resource "aws_cloudwatch_metric_alarm" "earnings-timeout-alarm" {
#   alarm_name = "lb-${var.env}-earnings-timeout-alarm"
#   comparison_operator = "GreaterThanThreshold"
#   evaluation_periods = 1
#   period = 300
#   metric_name = "lb-${var.env}-earnings-timeout-count"
#   namespace = "LogMetrics"
#   statistic = "Sum"
#   threshold = 0
#   alarm_actions = [data.aws_sns_topic.console-errors.arn]
#   datapoints_to_alarm = 1
#   treat_missing_data = "notBreaching"
# }
