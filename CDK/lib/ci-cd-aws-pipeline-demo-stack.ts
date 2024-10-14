import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { MyPipelineAppStage } from './stage';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class CiCdAwsPipelineDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Retrieve the GitHub Personal Access Token (PAT) from AWS Secrets Manager
    const githubSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GitHubSecret', 'github_PAT');
    const githubToken = githubSecret.secretValueFromJson('githubv1'); // Accessing the key 'githubv1'

    // Define the pipeline
    const pipeline = new CodePipeline(this, 'Pipeline', {
      crossAccountKeys: true,
      pipelineName: 'TestPipeline',
      synth: new CodeBuildStep('Build', {
        input: CodePipelineSource.gitHub("ankitanagarale/cdk-same-account-githubv1", "main", {
          authentication: githubToken, // Directly using the secret value
        }),
        commands: [
          'cp -r CDK test-copy/',
          'mv ./test-copy/CDK ./test-copy/build_artifacts',
          'cd CDK',
          'npm install',
          'npm run build',
          'npx cdk synth',
          'cp -r cdk.out/* ../test-copy/build_artifacts/',
          'cd ..',
          'cp -r aws/infra/codepipeline/* test-copy/',
          'cd test-copy',
          'chmod +x build.sh',
          './build.sh',
        ],
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        },
        primaryOutputDirectory: './test-copy/build_artifacts',
      }),
      selfMutation: false,
    });

    // Dev stage and roles
    const devStage = pipeline.addStage(new MyPipelineAppStage(this, "dev", {
      env: { account: "264852106485", region: "ap-south-1" },
    }));

    // Role for the dev stage
    // const devRole = new iam.Role(this, 'DevRoleCICD', {
    //   assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    //   inlinePolicies: {
    //     AssumeRolePolicy: new iam.PolicyDocument({
    //       statements: [
    //         new iam.PolicyStatement({
    //           actions: ['sts:AssumeRole'],
    //           resources: [
    //             'arn:aws:iam::954503069243:role/cdk-hnb659fds-deploy-role-954503069243-us-east-1',
    //             'arn:aws:iam::954503069243:role/cdk-hnb659fds-file-publishing-role-954503069243-us-east-1',
    //           ],
    //         }),
    //         new iam.PolicyStatement({
    //           actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
    //           resources: ['arn:aws:ssm:us-east-1:264852106485:parameter/matson-hello-world/*'],
    //         }),
    //       ],
    //     }),
    //   },
    // });
    const devRole = new iam.Role(this, 'DevRoleCICD', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        CodeBuildPermissions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:*'], // Full access to SSM
              resources: ['*'],   // You can restrict this to specific SSM resources if needed
            }),
            new iam.PolicyStatement({
              actions: ['s3:*'], // Full access to S3
              resources: ['*'],  // You can restrict this to specific S3 buckets if needed
            }),
            new iam.PolicyStatement({
              actions: ['codedeploy:*'], // Full access to CodeDeploy
              resources: ['*'],           // You can restrict this to specific CodeDeploy resources if needed
            }),
          ],
        }),
      },
    });

    // Deploy Application Step
    devStage.addPost(new CodeBuildStep("DeployApplication", {
      input: pipeline.synth,
      primaryOutputDirectory: '',
      commands: [
        'chmod +x deploy-dev.sh',
        './deploy-dev.sh',
      ],
      buildEnvironment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
      },
      env: {
        STAGE: 'dev',
        S3_BUCKET: 'dev-deploystage-sameaccount',
        S3_BUCKET_PATH: 's3://dev-deploystage-sameaccount',
      },
      role: devRole,
    }));
  }
}
