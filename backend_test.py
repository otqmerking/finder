import requests
import sys
import json
from datetime import datetime
import time

class FactoryFaultAPITester:
    def __init__(self, base_url="https://factory-fault-system.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.worker_uuid = f"test-worker-{int(time.time())}"
        self.test_fault_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else f"{self.api_url}/"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 200:
                        print(f"   Response: {response_data}")
                    elif isinstance(response_data, list):
                        print(f"   Response: List with {len(response_data)} items")
                except:
                    print(f"   Response: {response.text[:100]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")

            return success, response.json() if response.text and response.text.strip() else {}

        except requests.exceptions.RequestException as e:
            print(f"❌ Failed - Network Error: {str(e)}")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health check endpoint"""
        return self.run_test("Health Check", "GET", "", 200)

    def test_get_locations(self):
        """Test getting all factory locations"""
        success, response = self.run_test("Get Locations", "GET", "locations", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} locations")
            if len(response) >= 12:
                print("   ✅ Default locations appear to be initialized")
            else:
                print("   ⚠️  Expected at least 12 default locations")
        return success, response

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        success, response = self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)
        if success:
            expected_fields = ['total_faults', 'active_faults', 'resolved_faults', 'total_locations', 'avg_resolution_time']
            missing_fields = [field for field in expected_fields if field not in response]
            if not missing_fields:
                print("   ✅ All required stats fields present")
            else:
                print(f"   ⚠️  Missing fields: {missing_fields}")
        return success, response

    def test_get_active_faults(self):
        """Test getting active faults"""
        return self.run_test("Get Active Faults", "GET", "faults/active", 200)

    def test_get_all_faults(self):
        """Test getting all faults"""
        return self.run_test("Get All Faults", "GET", "faults", 200)

    def test_report_fault(self, location_name="1A"):
        """Test reporting a new fault"""
        # First check if there's already an active fault and resolve it
        active_success, active_faults = self.run_test("Check Active Faults", "GET", "faults/active", 200)
        if active_success and location_name in active_faults:
            existing_fault_id = active_faults[location_name]['id']
            print(f"   Found existing fault {existing_fault_id}, resolving first...")
            resolve_data = {"fault_id": existing_fault_id}
            self.run_test("Resolve Existing Fault", "POST", "faults/resolve", 200, data=resolve_data)
        
        fault_data = {
            "worker_uuid": self.worker_uuid,
            "location_name": location_name,
            "description": f"Test fault reported at {datetime.now()}"
        }
        
        success, response = self.run_test("Report Fault", "POST", "faults/report", 200, data=fault_data)
        if success and 'id' in response:
            self.test_fault_id = response['id']
            print(f"   ✅ Fault created with ID: {self.test_fault_id}")
        return success, response

    def test_resolve_fault(self):
        """Test resolving a fault"""
        if not self.test_fault_id:
            print("❌ No fault ID available for resolution test")
            return False, {}
        
        resolve_data = {
            "fault_id": self.test_fault_id
        }
        
        return self.run_test("Resolve Fault", "POST", "faults/resolve", 200, data=resolve_data)

    def test_report_duplicate_fault(self, location_name="1A"):
        """Test reporting a duplicate fault (should fail)"""
        fault_data = {
            "worker_uuid": self.worker_uuid,
            "location_name": location_name,
            "description": "Duplicate fault test"
        }
        
        return self.run_test("Report Duplicate Fault (Should Fail)", "POST", "faults/report", 400, data=fault_data)

    def test_export_faults(self):
        """Test fault export functionality"""
        success, _ = self.run_test("Export Faults", "GET", "export/faults", 200)
        return success

    def run_full_test_suite(self):
        """Run the complete test suite"""
        print("🚀 Starting Factory Fault System API Tests")
        print(f"   Base URL: {self.base_url}")
        print(f"   Worker UUID: {self.worker_uuid}")
        print("=" * 60)

        # Basic connectivity tests
        print("\n📡 CONNECTIVITY TESTS")
        self.test_health_check()

        # Data retrieval tests
        print("\n📊 DATA RETRIEVAL TESTS")
        locations_success, locations = self.test_get_locations()
        self.test_dashboard_stats()
        self.test_get_active_faults()
        self.test_get_all_faults()

        # Fault workflow tests
        print("\n🔧 FAULT WORKFLOW TESTS")
        if locations_success and locations:
            test_location = locations[0]['name'] if locations else "1A"
            print(f"   Using test location: {test_location}")
            
            # Test fault reporting
            fault_success, fault_response = self.test_report_fault(test_location)
            
            if fault_success:
                # Test duplicate fault (should fail)
                self.test_report_duplicate_fault(test_location)
                
                # Wait a moment then resolve the fault
                print("   Waiting 2 seconds before resolving fault...")
                time.sleep(2)
                self.test_resolve_fault()

        # Export test
        print("\n📤 EXPORT TESTS")
        self.test_export_faults()

        # Print final results
        print("\n" + "=" * 60)
        print(f"📊 FINAL RESULTS")
        print(f"   Tests Run: {self.tests_run}")
        print(f"   Tests Passed: {self.tests_passed}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL TESTS PASSED!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} TESTS FAILED")
            return 1

def main():
    tester = FactoryFaultAPITester()
    return tester.run_full_test_suite()

if __name__ == "__main__":
    sys.exit(main())