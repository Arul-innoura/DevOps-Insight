import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    X, Plus, Trash2, Save, Layers, Mail, Bell, ArrowUp, ArrowDown,
    Users, DollarSign, Shield, CheckCircle, AlertCircle, MessageSquare,
    Settings, Cloud, Server, ChevronRight,
    Lock, Search, Wrench, TrendingUp, BarChart2,
    Package, GitBranch
} from "lucide-react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { getProjectWorkflow, saveProjectWorkflow } from "../../services/projectWorkflowService";
import { fetchWorkflowDirectoryContacts } from "../../services/workflowDirectoryService";
import { ENVIRONMENTS, normalizeEnvironmentLabel, updateProjectEnvironments } from "../../services/ticketService";
import WorkflowPersonSuggest from "../../components/WorkflowPersonSuggest";

// ─── Cloud Services Catalog (140+ services across AWS, Azure, GCP) ───────────
const CLOUD_CATALOG = [
    // ── Compute ──────────────────────────────────────────────────────────────
    { id:'aws-eks',    terms:['kubernetes','k8s','eks','cluster','container orchestration'],              cloud:'AWS',   name:'Elastic Kubernetes Service (EKS)',          category:'Compute'    },
    { id:'azure-aks',  terms:['kubernetes','k8s','aks','cluster','container orchestration'],              cloud:'Azure', name:'Azure Kubernetes Service (AKS)',            category:'Compute'    },
    { id:'gcp-gke',    terms:['kubernetes','k8s','gke','cluster','container orchestration'],              cloud:'GCP',   name:'Google Kubernetes Engine (GKE)',            category:'Compute'    },
    { id:'aws-ec2',    terms:['virtual machine','vm','ec2','compute','server','instance'],                cloud:'AWS',   name:'EC2 (Elastic Compute Cloud)',               category:'Compute'    },
    { id:'azure-vm',   terms:['virtual machine','vm','compute','server','instance','azure vm'],           cloud:'Azure', name:'Azure Virtual Machines',                   category:'Compute'    },
    { id:'gcp-gce',    terms:['virtual machine','vm','compute engine','server','instance','gce'],         cloud:'GCP',   name:'Compute Engine',                           category:'Compute'    },
    { id:'aws-lambda', terms:['serverless','lambda','function','faas'],                                   cloud:'AWS',   name:'AWS Lambda',                               category:'Compute'    },
    { id:'azure-fn',   terms:['serverless','functions','function','faas'],                                cloud:'Azure', name:'Azure Functions',                          category:'Compute'    },
    { id:'gcp-fn',     terms:['serverless','functions','cloud functions','faas'],                         cloud:'GCP',   name:'Cloud Functions',                          category:'Compute'    },
    { id:'aws-ecs',    terms:['container','ecs','fargate','docker','orchestration'],                      cloud:'AWS',   name:'ECS / Fargate',                            category:'Compute'    },
    { id:'azure-aci',  terms:['container','container instances','aci','docker'],                          cloud:'Azure', name:'Azure Container Instances',                category:'Compute'    },
    { id:'gcp-run',    terms:['container','cloud run','serverless container','docker'],                   cloud:'GCP',   name:'Cloud Run',                                category:'Compute'    },
    { id:'aws-ecr',    terms:['container registry','ecr','docker registry','image'],                     cloud:'AWS',   name:'Elastic Container Registry (ECR)',          category:'Compute'    },
    { id:'azure-acr',  terms:['container registry','acr','docker registry','image'],                     cloud:'Azure', name:'Azure Container Registry (ACR)',            category:'Compute'    },
    { id:'gcp-ar',     terms:['container registry','artifact registry','docker registry','image'],        cloud:'GCP',   name:'Artifact Registry',                        category:'Compute'    },
    { id:'aws-bean',   terms:['paas','elastic beanstalk','app platform','web app'],                      cloud:'AWS',   name:'Elastic Beanstalk',                        category:'Compute'    },
    { id:'azure-app',  terms:['paas','app service','web app','web hosting'],                             cloud:'Azure', name:'Azure App Service',                        category:'Compute'    },
    { id:'gcp-ae',     terms:['paas','app engine','web app'],                                            cloud:'GCP',   name:'App Engine',                               category:'Compute'    },
    { id:'aws-batch',  terms:['batch','batch processing','job queue'],                                   cloud:'AWS',   name:'AWS Batch',                                category:'Compute'    },
    { id:'azure-bat',  terms:['batch','batch processing','job'],                                         cloud:'Azure', name:'Azure Batch',                              category:'Compute'    },
    { id:'gcp-bat',    terms:['batch','batch processing','job'],                                         cloud:'GCP',   name:'Cloud Batch',                              category:'Compute'    },
    { id:'azure-capp', terms:['container apps','dapr','serverless container'],                           cloud:'Azure', name:'Azure Container Apps',                     category:'Compute'    },
    { id:'gcp-anthos', terms:['anthos','hybrid','multi cloud','configuration management'],               cloud:'GCP',   name:'Anthos',                                   category:'Compute'    },
    // ── Database ─────────────────────────────────────────────────────────────
    { id:'aws-rds',    terms:['database','rds','relational','sql','postgres','mysql','aurora'],           cloud:'AWS',   name:'RDS (Relational Database Service)',         category:'Database'   },
    { id:'azure-sql',  terms:['database','sql database','relational','azure sql'],                       cloud:'Azure', name:'Azure SQL Database',                       category:'Database'   },
    { id:'gcp-sql',    terms:['database','cloud sql','relational','sql','postgres','mysql'],              cloud:'GCP',   name:'Cloud SQL',                                category:'Database'   },
    { id:'aws-aurora', terms:['aurora','mysql','postgres','relational','database'],                      cloud:'AWS',   name:'Amazon Aurora',                            category:'Database'   },
    { id:'azure-pg',   terms:['postgresql','postgres','database','relational'],                          cloud:'Azure', name:'Azure Database for PostgreSQL',             category:'Database'   },
    { id:'gcp-span',   terms:['spanner','relational','global','database','newsql'],                      cloud:'GCP',   name:'Cloud Spanner',                            category:'Database'   },
    { id:'aws-ddb',    terms:['nosql','dynamodb','document database','key value','database'],             cloud:'AWS',   name:'DynamoDB',                                 category:'Database'   },
    { id:'azure-cos',  terms:['nosql','cosmos db','cosmosdb','document','global','database'],             cloud:'Azure', name:'Azure Cosmos DB',                          category:'Database'   },
    { id:'gcp-fs',     terms:['nosql','firestore','document','database'],                                cloud:'GCP',   name:'Firestore',                                category:'Database'   },
    { id:'aws-ec',     terms:['cache','elasticache','redis','memcached','in-memory'],                    cloud:'AWS',   name:'ElastiCache',                              category:'Database'   },
    { id:'azure-rc',   terms:['cache','redis','azure cache','in-memory'],                               cloud:'Azure', name:'Azure Cache for Redis',                    category:'Database'   },
    { id:'gcp-ms',     terms:['cache','memorystore','redis','in-memory'],                               cloud:'GCP',   name:'Memorystore',                              category:'Database'   },
    { id:'aws-rs',     terms:['data warehouse','redshift','analytics','olap'],                           cloud:'AWS',   name:'Amazon Redshift',                          category:'Database'   },
    { id:'azure-syn',  terms:['data warehouse','synapse','analytics','olap'],                            cloud:'Azure', name:'Azure Synapse Analytics',                  category:'Database'   },
    { id:'gcp-bq',     terms:['data warehouse','bigquery','analytics','olap','bq'],                      cloud:'GCP',   name:'BigQuery',                                 category:'Database'   },
    { id:'aws-docddb', terms:['mongodb','documentdb','document','nosql','database'],                     cloud:'AWS',   name:'Amazon DocumentDB',                        category:'Database'   },
    { id:'azure-cos-m',terms:['mongodb','cosmos db mongo','document','nosql'],                           cloud:'Azure', name:'Cosmos DB for MongoDB',                    category:'Database'   },
    { id:'gcp-bt',     terms:['bigtable','wide column','nosql','time series'],                           cloud:'GCP',   name:'Cloud Bigtable',                           category:'Database'   },
    { id:'aws-nep',    terms:['graph','neptune','database','network'],                                   cloud:'AWS',   name:'Amazon Neptune',                           category:'Database'   },
    { id:'azure-grem', terms:['graph','gremlin','cosmos db','database'],                                cloud:'Azure', name:'Cosmos DB for Apache Gremlin',             category:'Database'   },
    { id:'gcp-aldb',   terms:['alloydb','postgres','postgresql','database'],                             cloud:'GCP',   name:'AlloyDB for PostgreSQL',                   category:'Database'   },
    { id:'aws-ts',     terms:['time series','timestream','iot','metrics','database'],                    cloud:'AWS',   name:'Amazon Timestream',                        category:'Database'   },
    { id:'gcp-fire',   terms:['firebase','realtime database','mobile','database'],                       cloud:'GCP',   name:'Firebase Realtime Database',               category:'Database'   },
    // ── Storage ───────────────────────────────────────────────────────────────
    { id:'aws-s3',     terms:['storage','s3','object','blob','bucket','file'],                           cloud:'AWS',   name:'Amazon S3',                                category:'Storage'    },
    { id:'azure-blob', terms:['storage','blob','object','bucket','file'],                                cloud:'Azure', name:'Azure Blob Storage',                       category:'Storage'    },
    { id:'gcp-gcs',    terms:['storage','cloud storage','object','bucket','gcs','file'],                 cloud:'GCP',   name:'Cloud Storage',                            category:'Storage'    },
    { id:'aws-ebs',    terms:['block storage','ebs','disk','volume'],                                    cloud:'AWS',   name:'EBS (Elastic Block Store)',                 category:'Storage'    },
    { id:'azure-dsk',  terms:['block storage','managed disk','disk','volume'],                           cloud:'Azure', name:'Azure Managed Disks',                      category:'Storage'    },
    { id:'gcp-pd',     terms:['block storage','persistent disk','disk','volume'],                        cloud:'GCP',   name:'Persistent Disk',                          category:'Storage'    },
    { id:'aws-efs',    terms:['file storage','efs','nfs','file system','shared'],                        cloud:'AWS',   name:'EFS (Elastic File System)',                 category:'Storage'    },
    { id:'azure-files',terms:['file storage','azure files','smb','nfs','file system'],                   cloud:'Azure', name:'Azure Files',                              category:'Storage'    },
    { id:'gcp-fstr',   terms:['file storage','filestore','nfs','file system'],                           cloud:'GCP',   name:'Filestore',                                category:'Storage'    },
    { id:'aws-glac',   terms:['archive','glacier','cold storage','backup'],                              cloud:'AWS',   name:'S3 Glacier',                               category:'Storage'    },
    { id:'azure-arc',  terms:['archive','cold storage','backup','archival'],                             cloud:'Azure', name:'Azure Archive Storage',                    category:'Storage'    },
    { id:'gcp-cold',   terms:['archive','coldline','cold storage','backup'],                             cloud:'GCP',   name:'Cloud Storage Coldline',                   category:'Storage'    },
    { id:'aws-bkp',    terms:['backup','aws backup','disaster recovery'],                                cloud:'AWS',   name:'AWS Backup',                               category:'Storage'    },
    { id:'azure-bkp',  terms:['backup','azure backup','disaster recovery'],                              cloud:'Azure', name:'Azure Backup',                             category:'Storage'    },
    { id:'gcp-bkp',    terms:['backup','cloud backup','disaster recovery'],                              cloud:'GCP',   name:'Google Cloud Backup',                      category:'Storage'    },
    // ── Networking ────────────────────────────────────────────────────────────
    { id:'aws-alb',    terms:['load balancer','alb','nlb','lb','elastic load balancing'],                cloud:'AWS',   name:'Elastic Load Balancing (ALB / NLB)',        category:'Networking' },
    { id:'azure-lb',   terms:['load balancer','azure lb','lb','network'],                               cloud:'Azure', name:'Azure Load Balancer',                      category:'Networking' },
    { id:'gcp-clb',    terms:['load balancer','cloud load balancing','lb','network'],                    cloud:'GCP',   name:'Cloud Load Balancing',                     category:'Networking' },
    { id:'aws-cf',     terms:['cdn','cloudfront','content delivery','edge'],                             cloud:'AWS',   name:'Amazon CloudFront',                        category:'Networking' },
    { id:'azure-cdn',  terms:['cdn','azure cdn','content delivery','edge'],                              cloud:'Azure', name:'Azure CDN',                                category:'Networking' },
    { id:'gcp-cdn',    terms:['cdn','cloud cdn','content delivery','edge'],                              cloud:'GCP',   name:'Cloud CDN',                                category:'Networking' },
    { id:'aws-r53',    terms:['dns','route 53','route53','domain'],                                      cloud:'AWS',   name:'Amazon Route 53',                          category:'Networking' },
    { id:'azure-dns',  terms:['dns','azure dns','domain'],                                               cloud:'Azure', name:'Azure DNS',                                category:'Networking' },
    { id:'gcp-dns',    terms:['dns','cloud dns','domain'],                                               cloud:'GCP',   name:'Cloud DNS',                                category:'Networking' },
    { id:'aws-vpc',    terms:['vpc','virtual network','vnet','network','private cloud'],                  cloud:'AWS',   name:'Amazon VPC',                               category:'Networking' },
    { id:'azure-vnet', terms:['vnet','virtual network','network','private'],                             cloud:'Azure', name:'Azure Virtual Network (VNet)',              category:'Networking' },
    { id:'gcp-vpc',    terms:['vpc','virtual network','network','private cloud'],                        cloud:'GCP',   name:'VPC Network',                              category:'Networking' },
    { id:'aws-apig',   terms:['api gateway','rest api','http api','websocket'],                          cloud:'AWS',   name:'API Gateway',                              category:'Networking' },
    { id:'azure-apim', terms:['api management','apim','api gateway','rest api'],                         cloud:'Azure', name:'Azure API Management',                     category:'Networking' },
    { id:'gcp-apig',   terms:['api gateway','apigee','api management','rest api','endpoints'],           cloud:'GCP',   name:'Apigee API Management',                    category:'Networking' },
    { id:'aws-vpn',    terms:['vpn','site-to-site vpn','client vpn','tunnel'],                          cloud:'AWS',   name:'AWS VPN',                                  category:'Networking' },
    { id:'azure-vpn',  terms:['vpn','vpn gateway','tunnel','site-to-site'],                              cloud:'Azure', name:'Azure VPN Gateway',                        category:'Networking' },
    { id:'gcp-vpn',    terms:['vpn','cloud vpn','tunnel','site-to-site'],                                cloud:'GCP',   name:'Cloud VPN',                                category:'Networking' },
    { id:'aws-nat',    terms:['nat','nat gateway','network address translation'],                         cloud:'AWS',   name:'NAT Gateway',                              category:'Networking' },
    { id:'azure-nat',  terms:['nat','nat gateway','network address translation'],                         cloud:'Azure', name:'Azure NAT Gateway',                        category:'Networking' },
    { id:'gcp-nat',    terms:['nat','cloud nat','network address translation'],                           cloud:'GCP',   name:'Cloud NAT',                                category:'Networking' },
    { id:'aws-dx',     terms:['direct connect','private connectivity','dedicated network'],               cloud:'AWS',   name:'AWS Direct Connect',                       category:'Networking' },
    { id:'azure-er',   terms:['expressroute','private connectivity','dedicated network'],                 cloud:'Azure', name:'Azure ExpressRoute',                       category:'Networking' },
    { id:'gcp-ic',     terms:['interconnect','cloud interconnect','private connectivity'],                cloud:'GCP',   name:'Cloud Interconnect',                       category:'Networking' },
    { id:'aws-pl',     terms:['private link','private endpoint','endpoint'],                             cloud:'AWS',   name:'AWS PrivateLink',                          category:'Networking' },
    { id:'azure-pl',   terms:['private link','private endpoint'],                                        cloud:'Azure', name:'Azure Private Link',                       category:'Networking' },
    { id:'gcp-psc',    terms:['private service connect','private link','private endpoint'],               cloud:'GCP',   name:'Private Service Connect',                  category:'Networking' },
    // ── Security ──────────────────────────────────────────────────────────────
    { id:'aws-kms',    terms:['key vault','kms','key management','encryption','secret'],                  cloud:'AWS',   name:'AWS KMS',                                  category:'Security'   },
    { id:'azure-kv',   terms:['key vault','azure key vault','encryption','secret','certificate'],         cloud:'Azure', name:'Azure Key Vault',                          category:'Security'   },
    { id:'gcp-kms',    terms:['key vault','cloud kms','key management','encryption','secret'],            cloud:'GCP',   name:'Cloud KMS',                                category:'Security'   },
    { id:'aws-sm',     terms:['secret','secrets manager','credential','password'],                        cloud:'AWS',   name:'AWS Secrets Manager',                      category:'Security'   },
    { id:'azure-sm',   terms:['secret','key vault secrets','credential','password'],                      cloud:'Azure', name:'Azure Key Vault Secrets',                  category:'Security'   },
    { id:'gcp-sm',     terms:['secret','secret manager','credential','password'],                         cloud:'GCP',   name:'Secret Manager',                           category:'Security'   },
    { id:'aws-iam',    terms:['iam','identity','access management','role','permission'],                  cloud:'AWS',   name:'AWS IAM',                                  category:'Security'   },
    { id:'azure-aad',  terms:['active directory','azure ad','identity','aad','entra','oauth','sso'],      cloud:'Azure', name:'Microsoft Entra ID (Azure AD)',             category:'Security'   },
    { id:'gcp-iam',    terms:['iam','identity','access management','role','permission'],                  cloud:'GCP',   name:'Cloud IAM',                                category:'Security'   },
    { id:'aws-waf',    terms:['waf','web application firewall','ddos','shield','security'],               cloud:'AWS',   name:'AWS WAF & Shield',                         category:'Security'   },
    { id:'azure-fw',   terms:['waf','firewall','ddos','web application firewall'],                        cloud:'Azure', name:'Azure Firewall / WAF',                     category:'Security'   },
    { id:'gcp-armor',  terms:['waf','cloud armor','ddos','security','firewall'],                         cloud:'GCP',   name:'Cloud Armor',                              category:'Security'   },
    { id:'aws-acm',    terms:['certificate','ssl','tls','acm','https'],                                  cloud:'AWS',   name:'AWS Certificate Manager (ACM)',             category:'Security'   },
    { id:'azure-cert', terms:['certificate','ssl','tls','https'],                                        cloud:'Azure', name:'Azure App Service Certificate',            category:'Security'   },
    { id:'gcp-cert',   terms:['certificate','ssl','tls','https','certificate manager'],                   cloud:'GCP',   name:'Certificate Manager',                      category:'Security'   },
    { id:'aws-sech',   terms:['security hub','soc','compliance','security center','posture'],             cloud:'AWS',   name:'AWS Security Hub',                         category:'Security'   },
    { id:'azure-def',  terms:['defender','security center','soc','compliance','microsoft defender'],      cloud:'Azure', name:'Microsoft Defender for Cloud',             category:'Security'   },
    { id:'gcp-scc',    terms:['security command center','scc','soc','compliance','posture'],              cloud:'GCP',   name:'Security Command Center',                  category:'Security'   },
    { id:'aws-ct',     terms:['audit','cloudtrail','compliance','audit log','trail'],                     cloud:'AWS',   name:'AWS CloudTrail',                           category:'Security'   },
    { id:'azure-al',   terms:['audit','activity log','compliance','audit log'],                          cloud:'Azure', name:'Azure Activity Log',                       category:'Security'   },
    { id:'gcp-al',     terms:['audit','cloud audit logs','compliance','audit log'],                       cloud:'GCP',   name:'Cloud Audit Logs',                         category:'Security'   },
    // ── CI/CD ─────────────────────────────────────────────────────────────────
    { id:'aws-cp',     terms:['ci/cd','cicd','pipeline','codepipeline','devops','ci server'],             cloud:'AWS',   name:'AWS CodePipeline',                         category:'CI/CD'      },
    { id:'azure-ado',  terms:['ci/cd','cicd','pipeline','devops','azure devops','ado','ci server'],       cloud:'Azure', name:'Azure DevOps',                             category:'CI/CD'      },
    { id:'gcp-cb',     terms:['ci/cd','cicd','pipeline','cloud build','devops','ci server'],              cloud:'GCP',   name:'Cloud Build',                              category:'CI/CD'      },
    { id:'aws-cc',     terms:['source control','git','codecommit','repository'],                          cloud:'AWS',   name:'AWS CodeCommit',                           category:'CI/CD'      },
    { id:'azure-repos',terms:['source control','git','repos','azure repos','repository'],                 cloud:'Azure', name:'Azure Repos',                              category:'CI/CD'      },
    { id:'gcp-csr',    terms:['source control','git','source repositories','repository'],                 cloud:'GCP',   name:'Cloud Source Repositories',                category:'CI/CD'      },
    { id:'aws-cbuild', terms:['build','codebuild','ci','continuous integration'],                         cloud:'AWS',   name:'AWS CodeBuild',                            category:'CI/CD'      },
    { id:'azure-pip',  terms:['build','azure pipelines','ci cd','continuous integration'],                cloud:'Azure', name:'Azure Pipelines',                          category:'CI/CD'      },
    { id:'gcp-cd',     terms:['deploy','cloud deploy','cd','continuous delivery'],                        cloud:'GCP',   name:'Cloud Deploy',                             category:'CI/CD'      },
    { id:'aws-ca',     terms:['artifact','package','codeartifact','npm','maven'],                         cloud:'AWS',   name:'AWS CodeArtifact',                         category:'CI/CD'      },
    { id:'azure-art',  terms:['artifact','package','azure artifacts','npm','nuget','maven'],              cloud:'Azure', name:'Azure Artifacts',                          category:'CI/CD'      },
    { id:'gcp-arp',    terms:['artifact','package','artifact registry','npm','maven'],                    cloud:'GCP',   name:'Artifact Registry (Packages)',              category:'CI/CD'      },
    // ── Monitoring ────────────────────────────────────────────────────────────
    { id:'aws-cw',     terms:['monitoring','cloudwatch','metrics','logs','alerting','observability'],      cloud:'AWS',   name:'Amazon CloudWatch',                        category:'Monitoring' },
    { id:'azure-mon',  terms:['monitoring','azure monitor','metrics','logs','alerting','observability'],   cloud:'Azure', name:'Azure Monitor',                            category:'Monitoring' },
    { id:'gcp-mon',    terms:['monitoring','cloud monitoring','metrics','alerting','observability'],       cloud:'GCP',   name:'Cloud Monitoring',                         category:'Monitoring' },
    { id:'aws-xray',   terms:['tracing','xray','distributed tracing','apm'],                             cloud:'AWS',   name:'AWS X-Ray',                                category:'Monitoring' },
    { id:'azure-ai',   terms:['tracing','application insights','apm','distributed tracing'],              cloud:'Azure', name:'Application Insights',                     category:'Monitoring' },
    { id:'gcp-trace',  terms:['tracing','cloud trace','distributed tracing','apm'],                       cloud:'GCP',   name:'Cloud Trace',                              category:'Monitoring' },
    { id:'aws-cwl',    terms:['logs','cloudwatch logs','logging'],                                        cloud:'AWS',   name:'CloudWatch Logs',                          category:'Monitoring' },
    { id:'azure-la',   terms:['logs','log analytics','logging'],                                          cloud:'Azure', name:'Log Analytics Workspace',                  category:'Monitoring' },
    { id:'gcp-log',    terms:['logs','cloud logging','logging'],                                          cloud:'GCP',   name:'Cloud Logging',                            category:'Monitoring' },
    // ── Messaging ─────────────────────────────────────────────────────────────
    { id:'aws-sqs',    terms:['queue','sqs','message queue','messaging'],                                 cloud:'AWS',   name:'Amazon SQS',                               category:'Messaging'  },
    { id:'azure-sb',   terms:['queue','service bus','message queue','messaging'],                         cloud:'Azure', name:'Azure Service Bus',                        category:'Messaging'  },
    { id:'gcp-ps',     terms:['queue','pub/sub','pubsub','message queue','messaging'],                    cloud:'GCP',   name:'Cloud Pub/Sub',                            category:'Messaging'  },
    { id:'aws-sns',    terms:['notification','sns','simple notification','push'],                          cloud:'AWS',   name:'Amazon SNS',                               category:'Messaging'  },
    { id:'azure-nh',   terms:['notification','notification hubs','push'],                                 cloud:'Azure', name:'Azure Notification Hubs',                  category:'Messaging'  },
    { id:'gcp-fcm',    terms:['notification','firebase messaging','push','fcm'],                          cloud:'GCP',   name:'Firebase Cloud Messaging',                 category:'Messaging'  },
    { id:'aws-eb',     terms:['event bus','eventbridge','event driven','integration'],                    cloud:'AWS',   name:'Amazon EventBridge',                       category:'Messaging'  },
    { id:'azure-eg',   terms:['event','event grid','event driven','integration'],                         cloud:'Azure', name:'Azure Event Grid',                         category:'Messaging'  },
    { id:'gcp-ea',     terms:['event','eventarc','event driven','integration'],                           cloud:'GCP',   name:'Eventarc',                                 category:'Messaging'  },
    { id:'aws-kin',    terms:['stream','kinesis','data streaming','kafka','real time'],                    cloud:'AWS',   name:'Amazon Kinesis',                           category:'Messaging'  },
    { id:'azure-eh',   terms:['stream','event hubs','data streaming','kafka','real time'],                cloud:'Azure', name:'Azure Event Hubs',                         category:'Messaging'  },
    { id:'aws-msk',    terms:['kafka','managed kafka','msk','streaming'],                                 cloud:'AWS',   name:'Amazon MSK (Managed Kafka)',                category:'Messaging'  },
    { id:'azure-ehk',  terms:['kafka','event hubs kafka','streaming'],                                    cloud:'Azure', name:'Event Hubs for Kafka',                     category:'Messaging'  },
    { id:'aws-sf',     terms:['workflow','step functions','orchestration','state machine'],                cloud:'AWS',   name:'AWS Step Functions',                       category:'Messaging'  },
    { id:'azure-la2',  terms:['workflow','logic apps','integration','automation'],                        cloud:'Azure', name:'Azure Logic Apps',                         category:'Messaging'  },
    { id:'gcp-wf',     terms:['workflow','cloud workflows','orchestration'],                              cloud:'GCP',   name:'Cloud Workflows',                          category:'Messaging'  },
    // ── Analytics ─────────────────────────────────────────────────────────────
    { id:'aws-ath',    terms:['analytics','athena','sql','query','serverless analytics'],                 cloud:'AWS',   name:'Amazon Athena',                            category:'Analytics'  },
    { id:'azure-de',   terms:['analytics','data explorer','query','time series analytics','kusto'],       cloud:'Azure', name:'Azure Data Explorer',                      category:'Analytics'  },
    { id:'gcp-dp',     terms:['analytics','dataproc','hadoop','spark'],                                   cloud:'GCP',   name:'Cloud Dataproc',                           category:'Analytics'  },
    { id:'aws-glue',   terms:['etl','glue','data integration','data pipeline'],                           cloud:'AWS',   name:'AWS Glue',                                 category:'Analytics'  },
    { id:'azure-df',   terms:['etl','data factory','data integration','pipeline'],                        cloud:'Azure', name:'Azure Data Factory',                       category:'Analytics'  },
    { id:'gcp-dflow',  terms:['etl','dataflow','data integration','apache beam'],                         cloud:'GCP',   name:'Dataflow',                                 category:'Analytics'  },
    { id:'aws-qs',     terms:['bi','business intelligence','quicksight','dashboard'],                     cloud:'AWS',   name:'Amazon QuickSight',                        category:'Analytics'  },
    { id:'azure-pbi',  terms:['bi','business intelligence','power bi','dashboard'],                       cloud:'Azure', name:'Power BI Embedded',                        category:'Analytics'  },
    { id:'gcp-lkr',    terms:['bi','business intelligence','looker','dashboard'],                         cloud:'GCP',   name:'Looker',                                   category:'Analytics'  },
    { id:'aws-os',     terms:['elasticsearch','search','opensearch','kibana','log search'],               cloud:'AWS',   name:'Amazon OpenSearch Service',                category:'Analytics'  },
    { id:'azure-srch', terms:['cognitive search','elasticsearch','azure search','full text','search'],    cloud:'Azure', name:'Azure AI Search',                          category:'Analytics'  },
    // ── AI / ML ───────────────────────────────────────────────────────────────
    { id:'aws-sm2',    terms:['machine learning','ml','sagemaker','ai','training','model'],               cloud:'AWS',   name:'Amazon SageMaker',                         category:'AI/ML'      },
    { id:'azure-ml',   terms:['machine learning','ml','azure ml','ai','training','model'],                cloud:'Azure', name:'Azure Machine Learning',                   category:'AI/ML'      },
    { id:'gcp-vai',    terms:['machine learning','ml','vertex ai','ai','training','model'],               cloud:'GCP',   name:'Vertex AI',                                category:'AI/ML'      },
    { id:'aws-rek',    terms:['vision','image recognition','rekognition','ai','computer vision'],         cloud:'AWS',   name:'Amazon Rekognition',                       category:'AI/ML'      },
    { id:'azure-cv',   terms:['vision','computer vision','ai','image recognition'],                       cloud:'Azure', name:'Azure Computer Vision',                    category:'AI/ML'      },
    { id:'gcp-vai2',   terms:['vision','vision ai','ai','image recognition'],                            cloud:'GCP',   name:'Vision AI',                                category:'AI/ML'      },
    { id:'aws-tra',    terms:['speech','transcribe','speech to text','asr'],                              cloud:'AWS',   name:'Amazon Transcribe',                        category:'AI/ML'      },
    { id:'azure-sp',   terms:['speech','cognitive speech','speech to text','tts'],                        cloud:'Azure', name:'Azure AI Speech',                          category:'AI/ML'      },
    { id:'gcp-stt',    terms:['speech','speech to text','asr'],                                           cloud:'GCP',   name:'Speech-to-Text',                           category:'AI/ML'      },
    { id:'aws-trl',    terms:['translate','translation','nlp','language'],                                cloud:'AWS',   name:'Amazon Translate',                         category:'AI/ML'      },
    { id:'azure-tr',   terms:['translate','translator','nlp','language'],                                 cloud:'Azure', name:'Azure AI Translator',                      category:'AI/ML'      },
    { id:'gcp-tr',     terms:['translate','translation api','nlp','language'],                            cloud:'GCP',   name:'Translation API',                          category:'AI/ML'      },
    { id:'aws-bed',    terms:['llm','generative ai','bedrock','foundation model','gpt'],                  cloud:'AWS',   name:'Amazon Bedrock',                           category:'AI/ML'      },
    { id:'azure-oai',  terms:['llm','generative ai','openai','gpt','chatgpt','foundation model'],         cloud:'Azure', name:'Azure OpenAI Service',                     category:'AI/ML'      },
    { id:'gcp-gem',    terms:['llm','generative ai','gemini','bard','foundation model'],                  cloud:'GCP',   name:'Vertex AI Gemini',                         category:'AI/ML'      },
    // ── Infrastructure ────────────────────────────────────────────────────────
    { id:'aws-cfm',    terms:['iac','infrastructure as code','cloudformation','provisioning'],            cloud:'AWS',   name:'AWS CloudFormation',                       category:'Infra'      },
    { id:'azure-arm',  terms:['iac','infrastructure as code','arm templates','bicep','provisioning'],     cloud:'Azure', name:'Azure ARM / Bicep',                        category:'Infra'      },
    { id:'gcp-dm',     terms:['iac','infrastructure as code','deployment manager','provisioning'],        cloud:'GCP',   name:'Deployment Manager',                       category:'Infra'      },
    { id:'aws-ssm',    terms:['configuration','systems manager','ssm','patch','parameter store'],         cloud:'AWS',   name:'AWS Systems Manager',                      category:'Infra'      },
    { id:'azure-arc2', terms:['hybrid','arc','configuration','multi cloud'],                              cloud:'Azure', name:'Azure Arc',                                category:'Infra'      },
    { id:'gcp-cc',     terms:['configuration','config connector','kubernetes','infrastructure'],          cloud:'GCP',   name:'Config Connector',                         category:'Infra'      },
    { id:'aws-org',    terms:['organization','multi account','governance','accounts'],                    cloud:'AWS',   name:'AWS Organizations',                        category:'Infra'      },
    { id:'azure-mg',   terms:['management groups','governance','multi account','subscription'],           cloud:'Azure', name:'Azure Management Groups',                  category:'Infra'      },
    { id:'gcp-rm',     terms:['resource manager','organization','governance','projects'],                 cloud:'GCP',   name:'Cloud Resource Manager',                   category:'Infra'      },
];

/** ISO currency choices for cloud service price (single select). */
const CLOUD_SERVICE_CURRENCIES = [
    "USD", "EUR", "GBP", "INR", "AED", "SAR", "QAR", "CAD", "AUD", "NZD",
    "JPY", "CHF", "SGD", "BHD", "KWD", "OMR", "ZAR", "SEK", "NOK", "DKK",
    "CNY", "HKD", "MXN", "BRL", "TRY", "PLN", "CZK", "HUF", "ILS", "KRW"
];

/** One currency for price; supports legacy API rows that only had `currencies[]`. */
const normalizeCloudCurrency = (s) => {
    const cur = s?.currency != null && String(s.currency).trim()
        ? String(s.currency).trim().toUpperCase()
        : "";
    if (cur) return cur;
    const legacy = Array.isArray(s?.currencies) ? s.currencies : [];
    const first = legacy[0];
    return first ? String(first).trim().toUpperCase() : "";
};

// ─── Service Note Editor (compact Quill) ──────────────────────────────────────
const ServiceNoteEditor = ({ value, onChange, placeholder = "Add notes..." }) => {
    const containerRef = useRef(null);
    const quillRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        if (!containerRef.current || quillRef.current) return;
        const q = new Quill(containerRef.current, {
            theme: 'snow',
            placeholder,
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link'],
                    ['clean']
                ]
            }
        });
        quillRef.current = q;
        if (value) q.root.innerHTML = value;
        q.on('text-change', () => {
            const html = q.root.innerHTML;
            onChangeRef.current(html === '<p><br></p>' ? '' : html);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div className="service-note-editor" ref={containerRef} />;
};

// ─── Services Section ─────────────────────────────────────────────────────────
const ServicesSection = ({ projectServices, setProjectServices, cloudServices, setCloudServices }) => {
    const [cloudSearch, setCloudSearch] = useState('');
    const [cloudResults, setCloudResults] = useState([]);
    const [servicesTab, setServicesTab] = useState("cloud");

    const searchCloud = (q) => {
        setCloudSearch(q);
        const query = q.trim().toLowerCase();
        if (!query) { setCloudResults([]); return; }
        const hits = CLOUD_CATALOG.filter(
            (s) => s.terms.some((t) => t.includes(query)) || s.name.toLowerCase().includes(query)
        ).slice(0, 18);
        setCloudResults(hits);
    };

    const addProjectService = () => {
        setProjectServices((prev) => [
            ...prev,
            { id: `ps-${Date.now()}-${Math.random()}`, serviceName: '', cpu: '', ram: '', notes: '' }
        ]);
    };

    const removeProjectService = (id) =>
        setProjectServices((prev) => prev.filter((s) => s.id !== id));

    const updateProjectService = (id, field, val) =>
        setProjectServices((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: val } : s)));

    const addCloudService = (item) => {
        setCloudServices((prev) => [
            ...prev,
            {
                id: `cs-${Date.now()}-${Math.random()}`,
                cloudPlatform: item.cloud,
                name: item.name,
                customName: "",
                category: item.category,
                currency: "",
                price: "",
                notes: ""
            }
        ]);
        setCloudSearch("");
        setCloudResults([]);
    };

    const removeCloudService = (id) =>
        setCloudServices((prev) => prev.filter((s) => s.id !== id));

    const updateCloudService = (id, field, val) =>
        setCloudServices((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: val } : s)));

    const cloudBadgeClass = (cloud) => {
        const c = (cloud || '').toLowerCase();
        if (c === 'aws') return 'svc-cloud-badge svc-cloud-aws';
        if (c === 'azure') return 'svc-cloud-badge svc-cloud-azure';
        if (c === 'gcp') return 'svc-cloud-badge svc-cloud-gcp';
        return 'svc-cloud-badge';
    };

    // ── Computed metrics ──────────────────────────────────────────────────────
    const totalCostByCurrency = useMemo(() => {
        return cloudServices.reduce((acc, svc) => {
            const raw = (svc.price || '').replace(/[^0-9.]/g, '');
            const price = parseFloat(raw);
            if (!isNaN(price) && price > 0 && svc.currency) {
                acc[svc.currency] = (acc[svc.currency] || 0) + price;
            }
            return acc;
        }, {});
    }, [cloudServices]);

    const cloudByPlatform = useMemo(() => cloudServices.reduce((acc, svc) => {
        const p = svc.cloudPlatform || 'Other';
        acc[p] = (acc[p] || 0) + 1;
        return acc;
    }, {}), [cloudServices]);

    const cloudByCategory = useMemo(() => cloudServices.reduce((acc, svc) => {
        const c = svc.category || 'Other';
        acc[c] = (acc[c] || 0) + 1;
        return acc;
    }, {}), [cloudServices]);

    const cloudServicesWithPrice = cloudServices.filter(s => {
        const n = parseFloat((s.price || '').replace(/[^0-9.]/g, ''));
        return !isNaN(n) && n > 0 && s.currency;
    });

    const platformColors = { AWS: '#ff9900', Azure: '#0078d4', GCP: '#4285f4', Other: '#64748b' };
    const maxPlatformCount = Math.max(...Object.values(cloudByPlatform), 1);

    const distinctPlatforms = Object.keys(cloudByPlatform).length;
    const distinctCategories = Object.keys(cloudByCategory).length;

    return (
        <div className="wf-services-layout">
            {/* ── Overview metrics row ─────────────────────────────────────── */}
            <div className="wf-metrics-grid">
                <div className="wf-metric-card">
                    <div className="wf-metric-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                        <Cloud size={17} />
                    </div>
                    <span className="wf-metric-value">{cloudServices.length}</span>
                    <span className="wf-metric-label">Cloud Services</span>
                </div>
                <div className="wf-metric-card">
                    <div className="wf-metric-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                        <Server size={17} />
                    </div>
                    <span className="wf-metric-value">{projectServices.length}</span>
                    <span className="wf-metric-label">Project Services</span>
                </div>
                <div className="wf-metric-card">
                    <div className="wf-metric-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}>
                        <DollarSign size={17} />
                    </div>
                    <span className="wf-metric-value">
                        {Object.keys(totalCostByCurrency).length > 0
                            ? Object.entries(totalCostByCurrency).map(([cur, amt]) => `${cur} ${amt.toLocaleString()}`).join(' + ')
                            : '—'}
                    </span>
                    <span className="wf-metric-label">Est. Monthly Total</span>
                </div>
                <div className="wf-metric-card">
                    <div className="wf-metric-icon" style={{ background: '#fdf4ff', color: '#9333ea' }}>
                        <Package size={17} />
                    </div>
                    <span className="wf-metric-value">{cloudServicesWithPrice.length}</span>
                    <span className="wf-metric-label">Services with Pricing</span>
                </div>
                <div className="wf-metric-card">
                    <div className="wf-metric-icon" style={{ background: '#ecfeff', color: '#0891b2' }}>
                        <BarChart2 size={17} />
                    </div>
                    <span className="wf-metric-value">{distinctPlatforms}</span>
                    <span className="wf-metric-label">Cloud Platforms</span>
                </div>
                <div className="wf-metric-card">
                    <div className="wf-metric-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
                        <Wrench size={17} />
                    </div>
                    <span className="wf-metric-value">{distinctCategories}</span>
                    <span className="wf-metric-label">Service Categories</span>
                </div>
            </div>

            {/* ── Tab bar ───────────────────────────────────────────────────── */}
            <div className="workflow-services-tabs" style={{ marginBottom: '1.25rem' }}>
                <button type="button" className={`workflow-services-tab ${servicesTab === "cloud" ? "active" : ""}`} onClick={() => setServicesTab("cloud")}>
                    <Cloud size={14} style={{ marginRight: 5 }} /> Cloud Services
                    {cloudServices.length > 0 && <span className="env-tab-badge" style={{ marginLeft: 6 }}>{cloudServices.length}</span>}
                </button>
                <button type="button" className={`workflow-services-tab ${servicesTab === "project" ? "active" : ""}`} onClick={() => setServicesTab("project")}>
                    <Server size={14} style={{ marginRight: 5 }} /> Project Services
                    {projectServices.length > 0 && <span className="env-tab-badge" style={{ marginLeft: 6 }}>{projectServices.length}</span>}
                </button>
            </div>

            {/* ── Cloud Services tab ────────────────────────────────────────── */}
            {servicesTab === "cloud" && (
            <div className="svc-sub">
                <div className="svc-sub-header">
                    <div>
                        <span className="svc-sub-title"><Cloud size={15} /> Cloud Services</span>
                        <span className="svc-sub-hint">Search 140+ services across AWS, Azure and GCP — add monthly pricing per service</span>
                    </div>
                </div>

                {/* Search */}
                <div className="svc-cloud-search-wrap">
                    <div className="svc-search-bar">
                        <div className="svc-cloud-search-row svc-cloud-search-enhanced">
                            <Search size={18} className="svc-search-icon" aria-hidden />
                            <input
                                type="text"
                                className="svc-cloud-search-input"
                                placeholder='Search catalog: Kubernetes, AKS, Load Balancer, Key Vault, S3…'
                                value={cloudSearch}
                                onChange={(e) => searchCloud(e.target.value)}
                            />
                            {cloudSearch ? (
                                <button type="button" className="svc-search-action-btn" title="Clear search" onClick={() => { setCloudSearch(""); setCloudResults([]); }}>
                                    <X size={16} /><span>Clear</span>
                                </button>
                            ) : (
                                <span className="svc-search-hint-pill">140+ services</span>
                            )}
                        </div>
                    </div>
                    {cloudResults.length > 0 && (
                        <div className="svc-cloud-results">
                            {cloudResults.map((item) => (
                                <button key={item.id} type="button" className="svc-cloud-result-row svc-cloud-result-enhanced" onClick={() => addCloudService(item)}>
                                    <span className={cloudBadgeClass(item.cloud)}>{item.cloud}</span>
                                    <span className="svc-result-name">{item.name}</span>
                                    <span className="svc-result-cat">{item.category}</span>
                                    <span className="svc-result-add-btn"><Plus size={14} /> Add</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {cloudSearch && cloudResults.length === 0 && (
                        <div className="svc-cloud-no-results">No services found for "{cloudSearch}".</div>
                    )}
                </div>

                {/* Added Cloud Services list */}
                {cloudServices.length === 0 ? (
                    <div className="svc-empty" style={{ marginTop: '0.75rem' }}>No cloud services added. Use the search above to find and add services.</div>
                ) : (
                    <>
                    <div className="svc-cloud-list">
                        {cloudServices.map((svc) => (
                            <div key={svc.id} className="svc-cloud-card svc-cloud-card-enhanced">
                                <div className="svc-cloud-card-head">
                                    <div className="svc-cloud-head-left">
                                        <div className="svc-cloud-head-badges">
                                            <span className={cloudBadgeClass(svc.cloudPlatform)}>{svc.cloudPlatform}</span>
                                            {svc.category && <span className="svc-cloud-cat svc-cloud-cat-pill">{svc.category}</span>}
                                        </div>
                                        <div className="svc-cloud-title-block">
                                            <div className="svc-cloud-primary-title">
                                                {(svc.customName || "").trim() || svc.name || "Cloud service"}
                                            </div>
                                            {(svc.customName || "").trim() && (svc.name || "").trim() && (
                                                <div className="svc-cloud-catalog-line" title={svc.name}>Catalog: {svc.name}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {svc.price && svc.currency && (
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 10px', fontSize: '0.9rem', fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>
                                                {svc.currency} {parseFloat((svc.price || '').replace(/[^0-9.]/g, '')) || svc.price}<span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#16a34a', marginLeft: 3 }}>/mo</span>
                                            </div>
                                        )}
                                        <button type="button" className="svc-remove-btn svc-remove-btn-solid" title="Remove cloud service" onClick={() => removeCloudService(svc.id)}>
                                            <Trash2 size={14} /><span>Remove</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="svc-fields svc-cloud-form">
                                    <div className="workflow-input-group">
                                        <label><span className="label-text">Service (from catalog)</span></label>
                                        <input type="text" className="svc-field-input svc-field-input-readonly" value={svc.name || ""} readOnly title={svc.name || ""} />
                                        <span className="label-hint" style={{ marginTop: 4 }}>Set automatically when you pick from search — not editable.</span>
                                    </div>
                                    <div className="workflow-input-group">
                                        <label><span className="label-text">Your name / label</span></label>
                                        <input type="text" className="svc-field-input" placeholder='e.g. "Prod EU AKS", "Shared cache", "DR database"' value={svc.customName || ""} onChange={(e) => updateCloudService(svc.id, "customName", e.target.value)} />
                                        <span className="label-hint" style={{ marginTop: 4 }}>Optional. Use this to name this instance the way your team refers to it.</span>
                                    </div>
                                    <div className="svc-cloud-meta-row svc-cloud-cost-pair">
                                        <div className="workflow-input-group">
                                            <label><span className="label-text">Monthly Cost Currency</span></label>
                                            <select className="svc-field-input svc-currency-select" value={svc.currency || ""} onChange={(e) => updateCloudService(svc.id, "currency", e.target.value)}>
                                                <option value="">Select currency…</option>
                                                {CLOUD_SERVICE_CURRENCIES.map((code) => (
                                                    <option key={code} value={code}>{code}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="workflow-input-group">
                                            <label><span className="label-text">Monthly Price</span></label>
                                            <input type="text" className="svc-field-input" placeholder="e.g. 150, 2500, pay-as-you-go" value={svc.price || ""} onChange={(e) => updateCloudService(svc.id, "price", e.target.value)} />
                                        </div>
                                    </div>
                                    <span className="label-hint" style={{ display: "block", marginTop: -4, marginBottom: 4 }}>
                                        Enter the estimated monthly cost. Numeric values are summed into the total below.
                                    </span>
                                    <div className="workflow-input-group">
                                        <label><span className="label-text">Notes</span></label>
                                        <ServiceNoteEditor key={svc.id} value={svc.notes} onChange={(val) => updateCloudService(svc.id, "notes", val)} placeholder="Region, tier, SKU, usage notes…" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Total cost banner */}
                    {Object.keys(totalCostByCurrency).length > 0 && (
                        <div className="wf-total-cost-banner">
                            <div className="wf-total-cost-banner-title">
                                <TrendingUp size={14} /> Estimated Monthly Total
                            </div>
                            <div className="wf-total-cost-items">
                                {Object.entries(totalCostByCurrency).map(([cur, amt]) => (
                                    <div key={cur} className="wf-total-cost-item">
                                        {cur} {amt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                    </div>
                                ))}
                            </div>
                            <div className="wf-total-cost-sub">
                                Based on {cloudServicesWithPrice.length} of {cloudServices.length} service{cloudServices.length !== 1 ? 's' : ''} with numeric pricing
                            </div>
                        </div>
                    )}

                    {/* Platform breakdown */}
                    {Object.keys(cloudByPlatform).length > 0 && (
                        <div className="wf-section-card" style={{ marginTop: '1.25rem' }}>
                            <div className="wf-section-card-title"><BarChart2 size={15} /> By Cloud Platform</div>
                            <div className="wf-platform-bars">
                                {Object.entries(cloudByPlatform).map(([platform, count]) => (
                                    <div key={platform} className="wf-platform-bar-row">
                                        <span className="wf-platform-bar-label">{platform}</span>
                                        <div className="wf-platform-bar-track">
                                            <div className="wf-platform-bar-fill" style={{ width: `${(count / maxPlatformCount) * 100}%`, background: platformColors[platform] || '#94a3b8' }} />
                                        </div>
                                        <span className="wf-platform-bar-count">{count}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="wf-category-chips" style={{ marginTop: '1rem' }}>
                                {Object.entries(cloudByCategory).sort((a,b) => b[1]-a[1]).map(([cat, cnt]) => (
                                    <span key={cat} className="wf-category-chip">
                                        {cat} <span className="wf-category-chip-count">{cnt}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    </>
                )}
            </div>
            )}

            {/* ── Project Services tab ──────────────────────────────────────── */}
            {servicesTab === "project" && (
            <div className="svc-sub">
                <div className="svc-sub-header">
                    <div>
                        <span className="svc-sub-title"><Server size={15} /> Project Config Services</span>
                        <span className="svc-sub-hint">Internal services running inside this project (e.g. Auth, Payment API)</span>
                    </div>
                    <button type="button" className="svc-add-btn svc-add-btn-enhanced" onClick={addProjectService}>
                        <Plus size={16} /> <span>Add service</span>
                    </button>
                </div>

                {projectServices.length === 0 ? (
                    <div className="svc-empty">No project services added. Click "Add Service" to begin.</div>
                ) : (
                    <div className="svc-project-list">
                        {projectServices.map((svc) => (
                            <div key={svc.id} className="svc-project-card svc-project-card-enhanced">
                                <div className="svc-card-topbar">
                                    <span className="svc-card-title">{svc.serviceName || "Unnamed service"}</span>
                                    <button type="button" className="svc-remove-btn svc-remove-btn-solid" title="Remove service" onClick={() => removeProjectService(svc.id)}>
                                        <Trash2 size={14} /><span>Remove</span>
                                    </button>
                                </div>
                                <div className="svc-fields">
                                    <div className="workflow-input-group">
                                        <label><span className="label-text">Service name</span></label>
                                        <input type="text" className="svc-field-input" placeholder="e.g. Auth Service, Payment API, Notification Worker" value={svc.serviceName} onChange={(e) => updateProjectService(svc.id, "serviceName", e.target.value)} />
                                    </div>
                                    <div className="svc-resource-row">
                                        <div className="workflow-input-group">
                                            <label><span className="label-text">CPU (range)</span></label>
                                            <input type="text" className="svc-field-input" placeholder="e.g. 0.5 – 2 cores" value={svc.cpu} onChange={(e) => updateProjectService(svc.id, "cpu", e.target.value)} />
                                        </div>
                                        <div className="workflow-input-group">
                                            <label><span className="label-text">RAM (range)</span></label>
                                            <input type="text" className="svc-field-input" placeholder="e.g. 512 MB – 4 GB" value={svc.ram} onChange={(e) => updateProjectService(svc.id, "ram", e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="workflow-input-group">
                                        <label><span className="label-text">Notes</span></label>
                                        <ServiceNoteEditor key={svc.id} value={svc.notes} onChange={(val) => updateProjectService(svc.id, 'notes', val)} placeholder="Dependencies, runtime, purpose..." />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}
        </div>
    );
};

const ENV_COLORS = {
    Development:               { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd", dot: "#3b82f6" },
    "Quality Assurance":       { bg: "#fef3c7", text: "#92400e", border: "#fcd34d", dot: "#f59e0b" },
    Staging:                   { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd", dot: "#8b5cf6" },
    "User Acceptance Testing": { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7", dot: "#10b981" },
    Production:                { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5", dot: "#ef4444" }
};

const getEnvStyle = (env) => ENV_COLORS[env] || { bg: "#f3f4f6", text: "#374151", border: "#d1d5db", dot: "#6b7280" };

const sortEnvCanonical = (list) =>
    [...new Set(list)].sort((a, b) => {
        const ia = ENVIRONMENTS.indexOf(a);
        const ib = ENVIRONMENTS.indexOf(b);
        if (ia === -1 && ib === -1) return String(a).localeCompare(String(b));
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

const emptyNotif = () => ({
    ticketStatusChanges: true,
    ticketStatusChangesMandatory: false,
    approvalRequests: true,
    approvalRequestsMandatory: true,
    approvalCompleted: true,
    approvalCompletedMandatory: false,
    costApprovalUpdates: true,
    costApprovalUpdatesMandatory: true,
    commentsAndUpdates: true,
    commentsAndUpdatesMandatory: false
});

const emptyInfra = () => ({
    cpu: '',
    memory: '',
    databaseRequired: false,
    databaseType: '',
    databaseAllocation: '',
    cloudProvider: '',
    region: '',
    monthlyCostEstimate: ''
});

const emptyWorkflow = () => ({
    emailRouting: { to: [], cc: [], bcc: [], toMandatory: [], ccMandatory: [], bccMandatory: [] },
    approvalLevels: [],
    managers: [],
    costApprovalRequired: false,
    costApprovers: [],
    notificationPreferences: emptyNotif(),
    infrastructure: emptyInfra()
});

const normalizeApprovalLevels = (levels = []) =>
    (levels || []).map((lvl, idx) => {
        const first = Array.isArray(lvl?.approvers) && lvl.approvers.length > 0 ? lvl.approvers[0] : {};
        return {
            ...lvl,
            level: idx + 1,
            approvers: [{
                role: first?.role || "",
                name: first?.name || "",
                email: first?.email || ""
            }]
        };
    });

/** Normalize To/CC/BCC entries to { email, name, role } (legacy string arrays supported). */
const normalizeRoutingRecipients = (arr) =>
    (Array.isArray(arr) ? arr : [])
        .map((item) => {
            if (typeof item === "string") {
                const email = item.trim().toLowerCase();
                return email && email.includes("@") ? { email, name: "", role: "" } : null;
            }
            const email = String(item?.email || "").trim().toLowerCase();
            if (!email || !email.includes("@")) return null;
            return {
                email,
                name: String(item?.name || "").trim(),
                role: String(item?.role || "").trim()
            };
        })
        .filter(Boolean);

const normalizeCfg = (raw) => {
    const er = raw?.emailRouting || {};
    return {
        ...emptyWorkflow(),
        ...(raw || {}),
        infrastructure: { ...emptyInfra(), ...(raw?.infrastructure || {}) },
        approvalLevels: normalizeApprovalLevels(raw?.approvalLevels || []),
        notificationPreferences: { ...emptyNotif(), ...(raw?.notificationPreferences || {}) },
        emailRouting: {
            to: normalizeRoutingRecipients(er.to),
            cc: normalizeRoutingRecipients(er.cc),
            bcc: normalizeRoutingRecipients(er.bcc),
            toMandatory: Array.isArray(er.toMandatory) ? [...er.toMandatory] : [],
            ccMandatory: Array.isArray(er.ccMandatory) ? [...er.ccMandatory] : [],
            bccMandatory: Array.isArray(er.bccMandatory) ? [...er.bccMandatory] : []
        },
        managers: raw?.managers || [],
        costApprovers: raw?.costApprovers || []
    };
};

// ─── Email Routing Row Editor ─────────────────────────────────────────────────
const EmailRoutingField = ({ label, hint, fieldKey, cfg, setCfg, workflowContacts = [] }) => {
    const [draft, setDraft] = useState({ role: "", name: "", email: "" });
    const mandatoryKey = `${fieldKey}Mandatory`;
    const recipients = cfg.emailRouting?.[fieldKey] || [];
    const mandatory = cfg.emailRouting?.[mandatoryKey] || [];
    const mandatorySet = useMemo(
        () => new Set((mandatory || []).map((m) => String(m).trim().toLowerCase()).filter(Boolean)),
        [mandatory]
    );

    const updateRouting = (nextRecipients, newMandatory) => {
        setCfg({ ...cfg, emailRouting: { ...cfg.emailRouting, [fieldKey]: nextRecipients, [mandatoryKey]: newMandatory } });
    };

    const commitDraft = () => {
        const email = String(draft.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) return;
        if (recipients.some((r) => r.email === email)) return;
        updateRouting(
            [...recipients, { email, name: String(draft.name || "").trim(), role: "" }],
            mandatory
        );
        setDraft({ role: "", name: "", email: "" });
    };

    const handleRemove = (emailKey) => {
        const em = String(emailKey || "").trim().toLowerCase();
        updateRouting(
            recipients.filter((r) => r.email !== em),
            mandatory.filter((m) => m !== em)
        );
    };

    const toggleMandatory = (emailKey, checked) => {
        const em = String(emailKey || "").trim().toLowerCase();
        const newMandatory = checked
            ? [...mandatory.filter((m) => m !== em), em]
            : mandatory.filter((m) => m !== em);
        updateRouting(recipients, newMandatory);
    };

    return (
        <div className="workflow-input-group">
            <label>
                <span className="label-text">{label}</span>
                <span className="label-hint">{hint}</span>
            </label>
            <div className="email-routing-editor">
                {recipients.length === 0 && (
                    <div className="email-routing-empty">No recipients added yet.</div>
                )}
                {recipients.map((row) => {
                    const email = row.email;
                    const isMandatory = mandatorySet.has(email);
                    return (
                        <div key={email} className={`email-routing-row${isMandatory ? " is-mandatory" : ""}`}>
                            <label
                                className={`email-mandatory-chk${isMandatory ? " checked" : ""}`}
                                title={isMandatory ? "Mandatory — users cannot remove this email" : "Click to make mandatory"}
                            >
                                <input
                                    type="checkbox"
                                    checked={isMandatory}
                                    onChange={(e) => toggleMandatory(email, e.target.checked)}
                                />
                                <span className="email-mandatory-icon">
                                    <Lock size={11} />
                                </span>
                                <span className="email-mandatory-label">{isMandatory ? "Mandatory" : "Optional"}</span>
                            </label>
                            <div className="email-routing-addr-block">
                                {row.name ? <span className="email-routing-meta name">{row.name}</span> : null}
                                <span className="email-routing-addr">{email}</span>
                            </div>
                            <button
                                type="button"
                                className="email-routing-remove"
                                onClick={() => handleRemove(email)}
                                title="Remove recipient"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    );
                })}
                <div
                    className="email-routing-add-block"
                    onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.shiftKey) return;
                        if (e.target && e.target.tagName === "INPUT") {
                            e.preventDefault();
                            commitDraft();
                        }
                    }}
                >
                    <WorkflowPersonSuggest
                        layout="routing"
                        showRole={false}
                        contacts={(workflowContacts || []).filter(
                            (c) => c && String(c.email || "").trim() && !recipients.some((r) => r.email === String(c.email).trim().toLowerCase())
                        )}
                        value={draft}
                        onChange={setDraft}
                    />
                    <div className="email-routing-add-actions">
                        <button type="button" className="btn-add-item small" onClick={commitDraft}>
                            <Plus size={12} /> Add {hint}
                        </button>
                    </div>
                    <p className="email-routing-add-hint">
                        Type name or email — pick a suggestion to auto-fill, edit if needed, then click Add {hint}.
                    </p>
                </div>
            </div>
        </div>
    );
};

// ─── Workflow Form ────────────────────────────────────────────────────────────
const WorkflowForm = ({ cfg, setCfg, workflowContacts = [] }) => {
    const addApproverRow = () => {
        const levels = [...(cfg.approvalLevels || [])];
        levels.push({ level: levels.length + 1, approvers: [{ role: "", name: "", email: "" }] });
        setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(levels) });
    };

    return (
        <div className="workflow-editor-form">
            {/* Approval Chain */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon primary">
                        <Shield size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Approval Chain</h4>
                        <p>Level-wise approval workflow — each level sends to the next on approval</p>
                    </div>
                    <button type="button" className="btn-add-item" onClick={addApproverRow}>
                        <Plus size={14} /> Add Level
                    </button>
                </div>
                <div className="workflow-section-content">
                    {(cfg.approvalLevels || []).length === 0 ? (
                        <div className="workflow-empty-hint">
                            No approval levels configured. Add levels to create an approval hierarchy.
                        </div>
                    ) : (
                        <div className="approval-chain">
                            {(cfg.approvalLevels || []).map((lvl, idx) => (
                                <div key={`${lvl.level}-${idx}`} className="approval-level-card">
                                    <div className="approval-level-header">
                                        <div className="level-badge">Level {idx + 1}</div>
                                        <div className="level-actions">
                                            <button
                                                type="button" className="btn-icon-sm"
                                                disabled={idx === 0} title="Move up"
                                                onClick={() => {
                                                    if (idx === 0) return;
                                                    const next = [...cfg.approvalLevels];
                                                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                    setCfg({ ...cfg, approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 })) });
                                                }}
                                            ><ArrowUp size={12} /></button>
                                            <button
                                                type="button" className="btn-icon-sm"
                                                disabled={idx === (cfg.approvalLevels || []).length - 1} title="Move down"
                                                onClick={() => {
                                                    if (idx >= (cfg.approvalLevels || []).length - 1) return;
                                                    const next = [...cfg.approvalLevels];
                                                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                                    setCfg({ ...cfg, approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 })) });
                                                }}
                                            ><ArrowDown size={12} /></button>
                                            <button
                                                type="button" className="btn-icon-sm danger" title="Remove"
                                                onClick={() => {
                                                    const next = [...cfg.approvalLevels];
                                                    next.splice(idx, 1);
                                                    setCfg({ ...cfg, approvalLevels: next.map((x, i) => ({ ...x, level: i + 1 })) });
                                                }}
                                            ><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                    <WorkflowPersonSuggest
                                        layout="approval"
                                        showRole
                                        contacts={workflowContacts}
                                        value={{
                                            role: lvl.approvers?.[0]?.role || "",
                                            name: lvl.approvers?.[0]?.name || "",
                                            email: lvl.approvers?.[0]?.email || ""
                                        }}
                                        onChange={(v) => {
                                            const al = [...cfg.approvalLevels];
                                            al[idx].approvers = [{ ...(al[idx].approvers?.[0] || {}), ...v }];
                                            setCfg({ ...cfg, approvalLevels: normalizeApprovalLevels(al) });
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Email Routing */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon">
                        <Mail size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Email Routing</h4>
                        <p>Configure notification recipients — <strong>lock</strong> an email to make it mandatory (users can't remove it)</p>
                    </div>
                </div>
                <div className="workflow-section-content">
                    <EmailRoutingField fieldKey="to"  label="Primary Recipients" hint="To"  cfg={cfg} setCfg={setCfg} workflowContacts={workflowContacts} />
                    <EmailRoutingField fieldKey="cc"  label="Copy Recipients"    hint="CC"  cfg={cfg} setCfg={setCfg} workflowContacts={workflowContacts} />
                    <EmailRoutingField fieldKey="bcc" label="Hidden Recipients"  hint="BCC" cfg={cfg} setCfg={setCfg} workflowContacts={workflowContacts} />
                </div>
            </div>

            {/* Cost Authorization */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon warning">
                        <DollarSign size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Cost Authorization</h4>
                        <p>Financial approval requirements</p>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={!!cfg.costApprovalRequired}
                            onChange={(e) => setCfg({ ...cfg, costApprovalRequired: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {cfg.costApprovalRequired && (
                    <div className="workflow-section-content">
                        <div className="cost-approvers-section">
                            <div className="section-subheader">
                                <span>Cost Approvers</span>
                                <button
                                    type="button" className="btn-add-item small"
                                    onClick={() => setCfg({ ...cfg, costApprovers: [...(cfg.costApprovers || []), { name: "", email: "" }] })}
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                            {(cfg.costApprovers || []).length === 0 ? (
                                <div className="workflow-empty-hint">Add cost approvers who can authorize financial expenditures.</div>
                            ) : (
                                <div className="approver-list">
                                    {(cfg.costApprovers || []).map((ap, j) => (
                                        <div key={j} className="approver-row compact">
                                            <WorkflowPersonSuggest
                                                layout="cost"
                                                showRole={false}
                                                contacts={workflowContacts}
                                                value={{ role: "", name: ap.name || "", email: ap.email || "" }}
                                                onChange={(v) => {
                                                    const ca = [...(cfg.costApprovers || [])];
                                                    ca[j] = { ...ca[j], name: v.name, email: v.email };
                                                    setCfg({ ...cfg, costApprovers: ca });
                                                }}
                                            />
                                            <button
                                                type="button" className="btn-remove-item"
                                                onClick={() => {
                                                    const ca = [...(cfg.costApprovers || [])];
                                                    ca.splice(j, 1);
                                                    setCfg({ ...cfg, costApprovers: ca });
                                                }}
                                            ><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Notifications */}
            <div className="workflow-section">
                <div className="workflow-section-header">
                    <div className="workflow-section-icon info">
                        <Bell size={18} />
                    </div>
                    <div className="workflow-section-title">
                        <h4>Notifications</h4>
                        <p>Configure alert preferences</p>
                    </div>
                </div>
                <div className="workflow-section-content">
                    <div className="notification-grid">
                        {[
                            { key: "ticketStatusChanges", label: "Status Updates", icon: AlertCircle, desc: "When ticket status changes" },
                            { key: "approvalRequests", label: "Approval Requests", icon: Shield, desc: "When approval is needed" },
                            { key: "approvalCompleted", label: "Approvals Done", icon: CheckCircle, desc: "When approval is completed" },
                            { key: "costApprovalUpdates", label: "Cost Updates", icon: DollarSign, desc: "Financial approval status" },
                            { key: "commentsAndUpdates", label: "Comments", icon: MessageSquare, desc: "New comments and updates" }
                        ].map(({ key, label, icon: Icon, desc }) => (
                            <div key={key} className="notification-item">
                                <div className="notification-info">
                                    <Icon size={16} className="notification-icon" />
                                    <div>
                                        <span className="notification-label">{label}</span>
                                        <span className="notification-desc">{desc}</span>
                                    </div>
                                </div>
                                <div className="notification-controls">
                                    <label className="checkbox-pill">
                                        <input
                                            type="checkbox"
                                            checked={!!cfg.notificationPreferences?.[key]}
                                            onChange={(e) => setCfg({
                                                ...cfg,
                                                notificationPreferences: {
                                                    ...emptyNotif(),
                                                    ...cfg.notificationPreferences,
                                                    [key]: e.target.checked
                                                }
                                            })}
                                        />
                                        <span>Enabled</span>
                                    </label>
                                    <label className="checkbox-pill mandatory">
                                        <input
                                            type="checkbox"
                                            checked={!!cfg.notificationPreferences?.[`${key}Mandatory`]}
                                            onChange={(e) => setCfg({
                                                ...cfg,
                                                notificationPreferences: {
                                                    ...emptyNotif(),
                                                    ...cfg.notificationPreferences,
                                                    [`${key}Mandatory`]: e.target.checked
                                                }
                                            })}
                                        />
                                        <span>Required</span>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Editor ──────────────────────────────────────────────────────────────
const ProjectWorkflowEditor = ({ project, onClose, onSaved }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [docId, setDocId] = useState(null);
    const [activeTab, setActiveTab] = useState("default");
    const [projectConfigTab, setProjectConfigTab] = useState("general");

    // default config + per-env configs
    const [defaultCfg, setDefaultCfg] = useState(emptyWorkflow);
    const [envCfgs, setEnvCfgs] = useState({});
    /** Ordered list of environment names (editable here; persisted on product + workflow). */
    const [managedEnvs, setManagedEnvs] = useState([]);
    const [newEnvName, setNewEnvName] = useState("");

    // project-level services (admin only)
    const [projectServices, setProjectServices] = useState([]);
    const [cloudServices, setCloudServices] = useState([]);
    const [workflowContacts, setWorkflowContacts] = useState([]);

    const projectEnvsKey = Array.isArray(project?.environments) ? project.environments.join("\u0001") : "";

    const load = useCallback(async () => {
        if (!project?.id) return;
        setLoading(true);
        setError("");
        try {
            const data = await getProjectWorkflow(project.id);
            setDocId(data.id || null);
            setDefaultCfg(normalizeCfg(data.defaultConfiguration));

            const rawEnvCfgs = data.environmentConfigurations || {};
            const fromProject = (Array.isArray(project?.environments) ? project.environments : [])
                .filter(Boolean)
                .map(normalizeEnvironmentLabel)
                .filter(Boolean);
            const fromStored = Object.keys(rawEnvCfgs);
            const mergedCanon = new Set(fromProject);
            for (const k of fromStored) {
                if (k) mergedCanon.add(normalizeEnvironmentLabel(k));
            }
            const merged = sortEnvCanonical([...mergedCanon]);

            const normalized = {};
            for (const canon of merged) {
                const rawKey =
                    fromStored.find((rk) => normalizeEnvironmentLabel(rk) === canon) ||
                    (project?.environments || []).find((pe) => normalizeEnvironmentLabel(pe) === canon);
                normalized[canon] = normalizeCfg(rawEnvCfgs[rawKey] || rawEnvCfgs[canon] || null);
            }
            setManagedEnvs(merged);
            setEnvCfgs(normalized);

            // Load project-level services
            setProjectServices(Array.isArray(data.projectServices) ? data.projectServices : []);
            setCloudServices(
                (Array.isArray(data.cloudServices) ? data.cloudServices : []).map((s) => ({
                    ...s,
                    customName: s?.customName != null ? String(s.customName) : "",
                    currency: normalizeCloudCurrency(s)
                }))
            );
        } catch (e) {
            setError(e.message || "Failed to load workflow");
        } finally {
            setLoading(false);
        }
    }, [project?.id, projectEnvsKey]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!project?.id) {
            setWorkflowContacts([]);
            return;
        }
        let cancelled = false;
        fetchWorkflowDirectoryContacts({})
            .then((rows) => {
                if (!cancelled) setWorkflowContacts(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled) setWorkflowContacts([]);
            });
        return () => {
            cancelled = true;
        };
    }, [project?.id]);

    const removeManagedEnv = (env) => {
        setManagedEnvs((prev) => prev.filter((e) => e !== env));
        setEnvCfgs((prev) => {
            const next = { ...prev };
            delete next[env];
            return next;
        });
        if (activeTab === env) setActiveTab("default");
    };

    const addManagedEnv = (name) => {
        const t = String(name || "").trim();
        if (!t) return;
        setManagedEnvs((prev) => {
            if (prev.includes(t)) return prev;
            return [...prev, t];
        });
        setEnvCfgs((prev) => {
            if (prev[t]) return prev;
            return { ...prev, [t]: normalizeCfg(null) };
        });
        setActiveTab(t);
    };

    const addCustomEnv = () => {
        addManagedEnv(newEnvName);
        setNewEnvName("");
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            await updateProjectEnvironments(project.id, managedEnvs);

            const filteredCfgs = Object.fromEntries(
                managedEnvs.map((env) => {
                    const cfg = envCfgs[env] || emptyWorkflow();
                    return [
                        env,
                        { ...cfg, approvalLevels: normalizeApprovalLevels(cfg.approvalLevels || []) }
                    ];
                })
            );

            const body = {
                id: docId,
                projectId: project.id,
                defaultConfiguration: {
                    ...defaultCfg,
                    approvalLevels: normalizeApprovalLevels(defaultCfg.approvalLevels || [])
                },
                environmentConfigurations: filteredCfgs,
                requestTypeOverrides: [],
                projectServices,
                cloudServices
            };
            await saveProjectWorkflow(project.id, body);
            onSaved?.();
            onClose?.();
        } catch (e) {
            setError(e.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const setEnvCfg = (env, cfg) => setEnvCfgs(prev => ({ ...prev, [env]: cfg }));

    const activeCfg = activeTab === "default" ? defaultCfg : (envCfgs[activeTab] || emptyWorkflow());
    const setActiveCfg = (cfg) => {
        if (activeTab === "default") setDefaultCfg(cfg);
        else setEnvCfg(activeTab, cfg);
    };

    const getEnvLevelCount = (env) => (envCfgs[env]?.approvalLevels || []).length;
    const getEnvCloud = (env) => envCfgs[env]?.infrastructure?.cloudProvider || '';

    const defaultLevels = (defaultCfg.approvalLevels || []).length;

    return (
        <div className="modal-overlay workflow-modal-overlay">
            <div className="modal-content workflow-editor-modal">
                {/* Header */}
                <div className="modal-header workflow-modal-header">
                    <div className="modal-title-group">
                        <div className="modal-icon"><Settings size={22} /></div>
                        <div>
                            <h2>Configure Project — {project?.name}</h2>
                            <span className="modal-subtitle">Approval workflows · Email routing · Cost authorization · Services</span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} title="Close"><X size={20} /></button>
                </div>

                <div className="modal-body workflow-modal-body">
                    {error && (
                        <div className="workflow-error">
                            <AlertCircle size={16} /><span>{error}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="workflow-loading">
                            <div className="loading-spinner"></div>
                            <span>Loading configuration...</span>
                        </div>
                    ) : (
                        <>
                            <div className="workflow-project-tabs">
                                <button
                                    type="button"
                                    className={`workflow-project-tab ${projectConfigTab === "general" ? "active" : ""}`}
                                    onClick={() => setProjectConfigTab("general")}
                                >
                                    <Settings size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                    General &amp; Workflows
                                </button>
                                <button
                                    type="button"
                                    className={`workflow-project-tab ${projectConfigTab === "services" ? "active" : ""}`}
                                    onClick={() => setProjectConfigTab("services")}
                                >
                                    <Cloud size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                    Services
                                    {(cloudServices.length + projectServices.length) > 0 && (
                                        <span className="env-tab-badge" style={{ marginLeft: 7 }}>{cloudServices.length + projectServices.length}</span>
                                    )}
                                </button>
                            </div>

                            {projectConfigTab === "services" ? (
                                <ServicesSection
                                    projectServices={projectServices}
                                    setProjectServices={setProjectServices}
                                    cloudServices={cloudServices}
                                    setCloudServices={setCloudServices}
                                />
                            ) : (
                                <>
                                    {/* Summary cards — General tab metrics */}
                                    <div className="workflow-summary-cards">
                                        <div className="summary-card">
                                            <div className="summary-icon"><Users size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">{defaultLevels}</span>
                                                <span className="summary-label">Approval Levels</span>
                                            </div>
                                        </div>
                                        <div className={`summary-card ${defaultCfg.costApprovalRequired ? 'active' : ''}`}>
                                            <div className="summary-icon"><DollarSign size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">{defaultCfg.costApprovalRequired ? 'Active' : 'Off'}</span>
                                                <span className="summary-label">Cost Approval</span>
                                            </div>
                                        </div>
                                        <div className="summary-card">
                                            <div className="summary-icon"><Layers size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">{managedEnvs.length || 0}</span>
                                                <span className="summary-label">Environments</span>
                                            </div>
                                        </div>
                                        <div className="summary-card">
                                            <div className="summary-icon"><Mail size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">{(defaultCfg.emailRouting?.to?.length || 0) + (defaultCfg.emailRouting?.cc?.length || 0)}</span>
                                                <span className="summary-label">Email Recipients</span>
                                            </div>
                                        </div>
                                        <div className="summary-card">
                                            <div className="summary-icon"><Bell size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">
                                                    {Object.values(defaultCfg.notificationPreferences || {}).filter(v => v === true).length}
                                                </span>
                                                <span className="summary-label">Notifications On</span>
                                            </div>
                                        </div>
                                        <div className={`summary-card ${cloudServices.length > 0 ? 'active' : ''}`}>
                                            <div className="summary-icon"><Package size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">{cloudServices.length}</span>
                                                <span className="summary-label">Cloud Services</span>
                                            </div>
                                        </div>
                                        <div className="summary-card">
                                            <div className="summary-icon"><GitBranch size={18} /></div>
                                            <div className="summary-content">
                                                <span className="summary-value">{projectServices.length}</span>
                                                <span className="summary-label">Project Services</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Manage environments — add / remove / custom */}
                                    <div className="workflow-env-manager">
                                        <div className="workflow-env-manager-head">
                                            <div>
                                                <h4 className="workflow-env-manager-title">Deployment environments</h4>
                                                <p className="workflow-env-manager-hint">
                                                    Add or remove environments for this product. Each can have its own workflow override.
                                                    Custom names appear in request forms for this product.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="workflow-env-chips">
                                            {managedEnvs.length === 0 ? (
                                                <span className="workflow-env-empty">No environments yet — add from the catalog or create a custom name.</span>
                                            ) : (
                                                managedEnvs.map((env) => {
                                                    const st = getEnvStyle(env);
                                                    return (
                                                        <span key={env} className="workflow-env-chip" style={{ borderColor: st.border, background: st.bg, color: st.text }}>
                                                            <span className="workflow-env-chip-dot" style={{ background: st.dot }} />
                                                            {env}
                                                            <button
                                                                type="button"
                                                                className="workflow-env-chip-remove"
                                                                title={`Remove ${env}`}
                                                                onClick={() => removeManagedEnv(env)}
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                        <div className="workflow-env-add-row">
                                            <span className="workflow-env-add-label">Add preset</span>
                                            <div className="workflow-env-catalog">
                                                {ENVIRONMENTS.map((env) => (
                                                    <button
                                                        key={env}
                                                        type="button"
                                                        className={`workflow-env-catalog-btn ${managedEnvs.includes(env) ? "disabled" : ""}`}
                                                        disabled={managedEnvs.includes(env)}
                                                        onClick={() => addManagedEnv(env)}
                                                    >
                                                        <Plus size={12} /> {env}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="workflow-env-custom-row">
                                            <span className="workflow-env-add-label">New environment</span>
                                            <input
                                                type="text"
                                                className="workflow-env-custom-input"
                                                placeholder="e.g. Sandbox, DR, EU-West"
                                                value={newEnvName}
                                                onChange={(e) => setNewEnvName(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomEnv())}
                                            />
                                            <button type="button" className="btn-secondary workflow-env-add-custom" onClick={addCustomEnv}>
                                                <Plus size={14} /> Add
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {projectConfigTab === "general" && (
                                <>
                                    {/* Environment tabs */}
                                    <div className="workflow-env-tabs">
                                        <button
                                            type="button"
                                            className={`workflow-env-tab ${activeTab === 'default' ? 'active' : ''}`}
                                            onClick={() => setActiveTab('default')}
                                        >
                                            <Layers size={13} /> Default
                                            {defaultLevels > 0 && (
                                                <span className="env-tab-badge">{defaultLevels} lvl</span>
                                            )}
                                        </button>
                                        {managedEnvs.map(env => {
                                            const style = getEnvStyle(env);
                                            const lvlCount = getEnvLevelCount(env);
                                            const cloud = getEnvCloud(env);
                                            const isActive = activeTab === env;
                                            return (
                                                <button
                                                    key={env}
                                                    type="button"
                                                    className={`workflow-env-tab ${isActive ? 'active' : ''}`}
                                                    style={isActive ? { borderColor: style.dot, color: style.text, background: style.bg } : {}}
                                                    onClick={() => setActiveTab(env)}
                                                >
                                                    <span style={{
                                                        width: 8, height: 8, borderRadius: '50%',
                                                        background: style.dot || '#6b7280',
                                                        display: 'inline-block', flexShrink: 0
                                                    }} />
                                                    {env}
                                                    {lvlCount > 0 && <span className="env-tab-badge">{lvlCount} lvl</span>}
                                                    {cloud && <span className="env-tab-badge cloud">{cloud}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Tab label */}
                                    <div className="workflow-tab-label">
                                        {activeTab === 'default' ? (
                                            <span>Default configuration — applies to all environments unless overridden below</span>
                                        ) : (
                                            <span>
                                                <span style={{
                                                    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                                                    background: getEnvStyle(activeTab).dot || '#6b7280',
                                                    marginRight: 6, verticalAlign: 'middle'
                                                }} />
                                                {activeTab} environment — overrides the default workflow for this environment only
                                            </span>
                                        )}
                                    </div>

                                    {/* Active form */}
                                    <WorkflowForm cfg={activeCfg} setCfg={setActiveCfg} workflowContacts={workflowContacts} />
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="modal-footer workflow-modal-footer">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn-primary" disabled={loading || saving} onClick={save}>
                        <Save size={16} /> {saving ? "Saving..." : "Save Configuration"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectWorkflowEditor;
