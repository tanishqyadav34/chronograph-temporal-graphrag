import json
import datetime
import random
import os

# Fictional employees and their profiles:
# Alice: Manager, supportive, coordination.
# Bob: Tech Lead, cautious, database focus (RDS/Cloud SQL).
# Charlie: DevOps, GCP advocate, infrastructure focus (Terraform, GKE).
# Dave: Senior Engineer, AWS loyalist, skeptical but cooperative.
# Eve: Junior Engineer, learner, assignee, IAM/testing focus.

EMPLOYEES = ["Alice", "Bob", "Charlie", "Dave", "Eve"]

# We will generate:
# Slack messages: 36 (40%)
# Jira tickets: 27 (30%)
# Git commits: 27 (30%)
# Total: 90 records.

# Timeline range: Jan 1, 2023 to June 30, 2023.
# We will generate timestamps chronologically.

# Let's seed random to guarantee reproducibility of the dataset.
random.seed(42)

def generate_timestamps(start_date, end_date, count):
    """Generate count sorted datetime objects between start_date and end_date."""
    timestamps = []
    delta = end_date - start_date
    delta_seconds = delta.total_seconds()
    for _ in range(count):
        random_second = random.randint(0, int(delta_seconds))
        ts = start_date + datetime.timedelta(seconds=random_second)
        timestamps.append(ts)
    timestamps.sort()
    return timestamps

start_dt = datetime.datetime(2023, 1, 1, 9, 0, 0, tzinfo=datetime.timezone.utc)
end_dt = datetime.datetime(2023, 6, 30, 18, 0, 0, tzinfo=datetime.timezone.utc)

timestamps = generate_timestamps(start_dt, end_dt, 90)

# Let's split timestamps into three phases:
# Phase 1: Jan - Feb (Records 0-29) -> Debate, planning, early research
# Phase 2: Mar - Apr (Records 30-59) -> Prep, design, POCs, initial code
# Phase 3: May - Jun (Records 60-89) -> Migration execution, testing, teardown, celebration

records = []

# Define standard content elements for each phase
slack_phase1 = [
    ("Charlie", "Hey team, with our growing data warehousing needs, we should really look into GCP BigQuery instead of trying to optimize Amazon Redshift. GCP's GKE options also look much cleaner for our container workloads."),
    ("Dave", "Redshift is working fine if we tune our distribution keys properly. Pushing for GCP means we have to re-evaluate our whole infrastructure. AWS is stable and we know it."),
    ("Alice", "Let's keep an open mind. If GCP can offer cost optimizations and simplify DevOps overhead, it might be worth exploring. Charlie, can you write up a quick comparative doc?"),
    ("Bob", "My biggest concern is the database migration. Moving our primary Postgres database from AWS RDS to GCP Cloud SQL is going to be high-risk. We need to be careful with downtime."),
    ("Charlie", "Thanks Alice, will do. Bob, Cloud SQL has some great replication tools that can sync with external databases. I'll include a section on migrating PostgreSQL."),
    ("Eve", "I'd love to help on this check! I can help research the security/IAM mappings between AWS and GCP. It'll be a great learning experience."),
    ("Dave", "GCP's IAM is completely different. In AWS, we have fine-grained control with IAM policies we already tested. Don't underestimate the security migration effort."),
    ("Charlie", "GCP IAM uses projects and folders which actually makes resource organization a lot easier than AWS account hierarchies. I advocate for migrating containerized apps first."),
    ("Bob", "Let's not jump directly to migration. I would advocate for running a microservice POC on GCP first. AWS is our safety net."),
    ("Dave", "I agree with Bob there. Run a POC before committing the team. I still argue against moving the core databases."),
    ("Alice", "Great, let's make that a plan. I will create some Jira tickets for the AWS/GCP analysis and POC planning. Bob, can you lead the database risk analysis?"),
    ("Bob", "Yep, I'll take a look at PG replication limitations. Eve, can you help me document the network latency between AWS and GCP?"),
    ("Eve", "Sure thing Bob, I'll set up ping tests between our VPCs and GCP projects. Let's document the findings in a wiki."),
]

slack_phase2 = [
    ("Bob", "I ran some latency tests on the GCP-AWS VPN. It's around 12ms. For DB replication, that's acceptable, but we should make sure we do it during low-traffic windows."),
    ("Charlie", "That is great news. I started setting up Terraform for our GCP foundation. It's so much cleaner than CloudFormation. GCP rules!"),
    ("Dave", "Cleanliness is subjective. CloudFormation has never failed us in production, Charlie. Don't break what's not broken."),
    ("Alice", "Dave, Terraform is our standard for new modules anyway. Let's cooperate on design reviews. Eve, how is the IAM mapping doc going?"),
    ("Eve", "It’s going well! I mapped AWS Roles to GCP Service Accounts. Dave pointed out some edge cases with S3 access from GCP services, but we figured it out."),
    ("Dave", "Yeah, GCP uses workload identity federation. It's actually decent, though configuring it was annoying. I worked with Eve on the policy mappings."),
    ("Bob", "Nice collab. I'm looking at our PostgreSQL config. To replicate RDS Postgres to Cloud SQL, we need logical replication enabled. That requires a reboot on AWS side."),
    ("Charlie", "Let's schedule that AWS RDS parameter group reboot for Sunday at 3 AM. Dave, do you mind if I assign the ticket for Terraform VPC peering to you?"),
    ("Dave", "Sure, assign it to me. But I'm going to make sure the routing tables on our AWS transit gateway are locked down. Security first."),
    ("Alice", "Excellent. We decided to target mid-May for the dry run databases sync. Eve will assist Bob on database mapping tasks."),
    ("Eve", "Awesome, excited to learn PG logical replication!"),
    ("Bob", "I'll create the database migration runbook doc today. Charlie, let's verify Cloud SQL performance benchmarks first."),
]

slack_phase3 = [
    ("Alice", "Reminder: Code freeze is tonight. We are executing the migration dry-run this Saturday. Everyone ready?"),
    ("Charlie", "VPC peering is stable. GCP GKE clusters are up. Terraform code is locked. All systems go!"),
    ("Dave", "I completed the AWS IAM teardown scripts. They are staged in the git repo. I'll run them only after Bob gives final signoff on GCP database sync."),
    ("Bob", "Dry run database sync completed successfully. Zero replication lag after 4 hours. Database sync is fully operational."),
    ("Eve", "All integration tests passed on the staging GKE cluster! Connection pools are looking solid."),
    ("Alice", "Amazing work! Let's schedule the final DNS cutover for Friday night. Bob and Charlie will handle switchover. Dave will monitor AWS side."),
    ("Charlie", "DNS records updated. Traffic is routing to GCP GKE now! Latencies look incredible."),
    ("Bob", "Database cutover complete. Cloud SQL PostgreSQL instance promoted to primary. I see zero errors in the web logs."),
    ("Dave", "I verified AWS resources are inactive. Starting teardown of the old RDS instance. I have to admit, Cloud SQL's promotion was pretty seamless."),
    ("Alice", "Congratulations team! We are officially 100% on GCP now. AWS migration is fully resolved! GCP rocks. Code base cleanup next."),
    ("Eve", "Yay! Thanks everyone for teaching me so much about GCP and PG replication!"),
]

git_phase1 = [
    ("Charlie", "chore: initialize terraform layout for GCP landing zone tests"),
    ("Charlie", "feat: add GCP project setup scripts for POC environment"),
    ("Dave", "test: add network benchmark script for AWS EC2 instance nodes"),
    ("Dave", "ci: update github actions to include aws-cli dependencies"),
    ("Bob", "docs: analyze pg_dump and logical replication options for RDS Postgres"),
]

git_phase2 = [
    ("Charlie", "feat: configure GCP VPC and Cloud NAT with Terraform"),
    ("Dave", "feat: implement VPC Peering Terraform script between AWS & GCP"),
    ("Charlie", "refactor: simplify Terraform service accounts configuration in GCP"),
    ("Bob", "feat: create migration utility script for database schema verification"),
    ("Eve", "docs: add mapping outline of AWS IAM roles to GCP service accounts"),
    ("Bob", "feat: add schema sync script to map RDS schema to Cloud SQL"),
    ("Charlie", "feat: build Docker container for staging deployment on GKE"),
    ("Dave", "security: apply IAM permission boundaries to GCP transition roles"),
]

git_phase3 = [
    ("Charlie", "feat: add Kubernetes deployment manifests for core services on GKE"),
    ("Eve", "test: add system integration tests for GCP staging services"),
    ("Bob", "feat: add replication lag monitoring script for Cloud SQL target"),
    ("Charlie", "ci: update deployment pipelines to target GCP GKE clusters"),
    ("Bob", "script: finalize PostgreSQL promotion and switchover sequence script"),
    ("Charlie", "fix: adjust GKE ingress resource limits and SSL certificates config"),
    ("Eve", "test: add connection pool validation tests to GCP staging"),
    ("Dave", "script: implement AWS teardown utility for EC2, RDS, and VPC cleanup"),
    ("Dave", "script: run AWS resources cleanup and archive old S3 buckets"),
    ("Charlie", "chore: delete obsolete AWS CloudFormation templates"),
]

jira_phase1 = [
    ("Alice", "CHRONO-101", "Research AWS vs GCP Migration Costs and Performance Benefits", "To Do", "Charlie"),
    ("Alice", "CHRONO-102", "Assess Database Migration Risk from RDS PostgreSQL to GCP Cloud SQL", "In Progress", "Bob"),
    ("Charlie", "CHRONO-103", "Create GCP Proof-of-Concept Project & Structure", "Done", "Charlie"),
    ("Bob", "CHRONO-104", "Measure Network Latency between AWS VPC and GCP VPC", "Done", "Bob"),
    ("Alice", "CHRONO-105", "Hold Architecture Review for GCP Migration Plan", "Done", "Bob"),
]

jira_phase2 = [
    ("Alice", "CHRONO-201", "Configure VPC Peering between AWS and GCP", "Done", "Dave"),
    ("Alice", "CHRONO-202", "Map AWS IAM Policies to GCP IAM Service Accounts", "Done", "Eve"),
    ("Bob", "CHRONO-203", "Test logical replication between RDS Postgres and Cloud SQL", "In Progress", "Bob"),
    ("Alice", "CHRONO-204", "Set up GKE Cluster configuration with Terraform", "Done", "Charlie"),
    ("Charlie", "CHRONO-205", "Build GKE CI/CD templates in GitHub Actions", "Done", "Charlie"),
    ("Bob", "CHRONO-206", "Document PG version compatibility between RDS and GCP", "Done", "Eve"),
]

jira_phase3 = [
    ("Alice", "CHRONO-301", "Implement DB switchover automation scripts", "Done", "Bob"),
    ("Alice", "CHRONO-302", "Verify connection pooling and performance on Cloud SQL", "Done", "Bob"),
    ("Charlie", "CHRONO-303", "Deploy Core API service to GCP staging GKE", "Done", "Charlie"),
    ("Alice", "CHRONO-304", "Execute DB dry-run replication and verify lag", "Done", "Bob"),
    ("Alice", "CHRONO-305", "Update DNS and cutover traffic to GCP GKE Ingress", "Done", "Charlie"),
    ("Alice", "CHRONO-306", "Decommission AWS resources (EC2, RDS, VPC)", "Done", "Dave"),
]

# We need:
# Slack messages: 36 (40% of 90) -> Phase 1: 12, Phase 2: 12, Phase 3: 12
# Git commits: 27 (30% of 90) -> Phase 1: 8, Phase 2: 9, Phase 3: 10
# Jira tickets: 27 (30% of 90) -> Phase 1: 8, Phase 2: 9, Phase 3: 10

# Let's verify lengths of our lists:
# slack_phase1: 13
# slack_phase2: 12
# slack_phase3: 11
# git_phase1: 5
# git_phase2: 8
# git_phase3: 10
# jira_phase1: 5
# jira_phase2: 6
# jira_phase3: 6

# We need to fill or adjust these lists to match the targets.
# Let's expand git and jira messages/tickets programmatically or define more elements.

git_phase1_extra = [
    ("Eve", "docs: research GCP IAM project folder architecture structures"),
    ("Charlie", "chore: setup terraform remote state bucket in GCS"),
    ("Dave", "test: write mock workload scripts for AWS RDS benchmarks"),
] # total git phase 1 = 8

git_phase2_extra = [
    ("Bob", "feat: create Postgres config checker for replication settings"),
] # total git phase 2 = 9

jira_phase1_extra = [
    ("Alice", "CHRONO-106", "Draft GCP Landing Zone security requirements template", "Done", "Dave"),
    ("Alice", "CHRONO-107", "Review AWS S3 data backup size and transfer speed limits", "Done", "Eve"),
    ("Alice", "CHRONO-108", "Document GKE container registry migration steps", "Done", "Charlie"),
] # total jira phase 1 = 8

jira_phase2_extra = [
    ("Alice", "CHRONO-207", "Validate workload identity credential rotation", "Done", "Dave"),
    ("Alice", "CHRONO-208", "Setup GCP Cloud NAT rules for GKE private nodes", "Done", "Charlie"),
    ("Alice", "CHRONO-209", "Perform benchmark for GCP Memorystore Redis tier", "Done", "Bob"),
] # total jira phase 2 = 9

jira_phase3_extra = [
    ("Alice", "CHRONO-307", "Establish GCP alert manager dashboard and slack hooks", "Done", "Eve"),
    ("Alice", "CHRONO-308", "Verify GCP BigQuery raw data loads from old S3 logs", "Done", "Charlie"),
    ("Alice", "CHRONO-309", "Write AWS RDS instance deletion runbook", "Done", "Dave"),
    ("Alice", "CHRONO-310", "Archive legacy AWS IAM roles and group permissions", "Done", "Eve"),
] # total jira phase 3 = 10

# Collect groups per phase
phase1_pool = []
phase2_pool = []
phase3_pool = []

# Phase 1: 12 Slack, 8 Git, 8 Jira. Total: 28 records. Let's make it 30.
# Let's partition: records 0-29 (Phase 1, 30 records), 30-59 (Phase 2, 30 records), 60-89 (Phase 3, 30 records).
# Phase 1 targets:
# - Slack: 12
# - Git: 9
# - Jira: 9
# Phase 2 targets:
# - Slack: 12
# - Git: 9
# - Jira: 9
# Phase 3 targets:
# - Slack: 12
# - Git: 9
# - Jira: 9
# Total: 36 Slack, 27 Git, 27 Jira = 90.

# Assemble lists to match exactly:
phase1_slacks = slack_phase1[:12] # 12 items
phase1_gits = (git_phase1 + git_phase1_extra)[:9] # 5 + 3 = 8. Let's add 1.
phase1_gits.append(("Bob", "docs: analyze AWS IAM policy limitations on transit gateways"))

phase1_jiras = (jira_phase1 + jira_phase1_extra)[:9] # 5 + 3 = 8. Let's add 1.
phase1_jiras.append(("Alice", "CHRONO-109", "Draft IAM mapping criteria AWS to GCP", "Done", "Eve"))

# Phase 2:
phase2_slacks = slack_phase2[:12] # 12 items
phase2_gits = (git_phase2 + git_phase2_extra)[:9] # 8 + 1 = 9 items
phase2_jiras = (jira_phase2 + jira_phase2_extra)[:9] # 6 + 3 = 9 items

# Phase 3:
phase3_slacks = slack_phase3[:12] # 11 items. Let's add 1.
phase3_slacks.append(("Dave", "We finalized deleting the AWS resources today. Clean slate!"))

phase3_gits = git_phase3[:9] # 10 items, take first 9.
phase3_jiras = (jira_phase3 + jira_phase3_extra)[:9] # 6 + 4 = 10, take first 9.

# Let's adjust to get exactly 90 total.
# Let's double check lengths:
# Phase 1: 12 slacks, 9 gits, 9 jiras = 30
# Phase 2: 12 slacks, 9 gits, 9 jiras = 30
# Phase 3: 12 slacks, 9 gits, 9 jiras = 30
# Total: 36 Slack, 27 Git, 27 Jira = 90.

# Build lists
p1_items = []
for author, msg in phase1_slacks:
    p1_items.append({"source_type": "slack", "author": author, "content": msg})
for author, msg in phase1_gits:
    p1_items.append({"source_type": "git", "author": author, "content": msg})
for author, ticket_id, title, status, assignee in phase1_jiras:
    p1_items.append({
        "source_type": "jira",
        "author": author,
        "content": f"Ticket {ticket_id}: '{title}' | Status: {status} | Assignee: {assignee}"
    })

p2_items = []
for author, msg in phase2_slacks:
    p2_items.append({"source_type": "slack", "author": author, "content": msg})
for author, msg in phase2_gits:
    p2_items.append({"source_type": "git", "author": author, "content": msg})
for author, ticket_id, title, status, assignee in phase2_jiras:
    p2_items.append({
        "source_type": "jira",
        "author": author,
        "content": f"Ticket {ticket_id}: '{title}' | Status: {status} | Assignee: {assignee}"
    })

p3_items = []
for author, msg in phase3_slacks:
    p3_items.append({"source_type": "slack", "author": author, "content": msg})
for author, msg in phase3_gits:
    p3_items.append({"source_type": "git", "author": author, "content": msg})
for author, ticket_id, title, status, assignee in phase3_jiras:
    p3_items.append({
        "source_type": "jira",
        "author": author,
        "content": f"Ticket {ticket_id}: '{title}' | Status: {status} | Assignee: {assignee}"
    })

# Shuffle individual phase items, but keep them in their phase, so timestamps are chronologically grouped by phase.
random.shuffle(p1_items)
random.shuffle(p2_items)
random.shuffle(p3_items)

all_items = p1_items + p2_items + p3_items

# Assign IDs and Timestamps
# timestamps is a list of 90 sorted dates.
for i, item in enumerate(all_items):
    item["source_id"] = f"rec_{i+1:03d}"
    item["timestamp"] = timestamps[i].isoformat()

# Save JSON file
data_directory = os.path.dirname(os.path.abspath(__file__))
output_file = os.path.join(data_directory, "mock_dataset.json")

# Ensure directory exists and write
os.makedirs(data_directory, exist_ok=True)
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(all_items, f, indent=2)

print(f"Generated {len(all_items)} records.")
# Count types
types = [x["source_type"] for x in all_items]
for t in ["slack", "git", "jira"]:
    print(f" - {t}: {types.count(t)} ({types.count(t)/len(all_items)*100:.1f}%)")
