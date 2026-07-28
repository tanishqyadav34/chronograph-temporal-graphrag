from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USER")
password = os.getenv("NEO4J_PASSWORD")

# neo4j+s:// requires strict CA verification, which fails on Microsoft Store
# Python (no default trust store). Switch to neo4j+ssc:// which keeps TLS
# encryption but trusts self-signed certificates — AuraDB's free tier cert.
uri = uri.replace("neo4j+s://", "neo4j+ssc://")

print(f"Connecting to: {uri}")
print(f"User: {user}")

driver = GraphDatabase.driver(uri, auth=(user, password))
with driver.session() as session:
    result = session.run("RETURN 1 AS test")
    print(result.single())
driver.close()
print("SUCCESS")
