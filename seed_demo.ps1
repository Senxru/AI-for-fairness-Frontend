# seed_demo.ps1
$ErrorActionPreference = "Stop"

$API = "http://127.0.0.1:8001"

# Use unique usernames each run
$suffix = (Get-Date -Format "yyyyMMddHHmmss")
$judgeUser = "judge.seed.$suffix"
$authUser  = "authority.seed.$suffix"
$pass      = "pass123"

Write-Host "Creating Court Authority user: $authUser"
$authSignupBody = @{
  full_name    = "Seed Authority"
  username     = $authUser
  password     = $pass
  authority_id = "Seed-Authority-01"
} | ConvertTo-Json

$authResp = Invoke-RestMethod -Method Post -Uri "$API/auth/court-authority/signup" -ContentType "application/json" -Body $authSignupBody
$authToken = $authResp.access_token

Write-Host "Creating Judge user: $judgeUser"
$judgeSignupBody = @{
  full_name = "Seed Judge"
  username  = $judgeUser
  password  = $pass
  bench_id  = "Seed-Bench-01"
} | ConvertTo-Json

$judgeResp = Invoke-RestMethod -Method Post -Uri "$API/auth/judge/signup" -ContentType "application/json" -Body $judgeSignupBody
$judgeToken = $judgeResp.access_token

# 10 sample cases
$regions = @("Maharashtra","Delhi","Karnataka","Tamil Nadu","Gujarat")
$genders = @("male","female","unknown")

$caseIds = @()

for ($i=1; $i -le 50; $i++) {
  $region = $regions[($i-1) % $regions.Count]
  $gender = $genders[($i-1) % $genders.Count]

  $payload = @{
    date = "2026-03-01"
    accused_gender = $gender
    region = $region
    court = "Demo Court $i"
    facts = "Demo facts for case $i. Accused seeks bail. Low flight risk. Cooperating with investigation."
    legal_issues = "Bail under CrPC"
    judgment_reason = "No prior convictions and stable residence"
    summary = "Seeded demo case $i"
    crime_type = "Theft"
    ipc_sections = "379"
    prior_cases = 0
  } | ConvertTo-Json

  $pred = Invoke-RestMethod -Method Post -Uri "$API/predict" -Headers @{ Authorization = "Bearer $authToken" } -ContentType "application/json" -Body $payload

  if (-not $pred.case_id) { throw "No case_id returned from /predict for case $i" }

  $caseIds += [int]$pred.case_id
  Write-Host "Created case_id=$($pred.case_id) AI=$($pred.decision)"
}

# Save judge decisions for each case
for ($idx=0; $idx -lt $caseIds.Count; $idx++) {
  $caseId = $caseIds[$idx]

  # Alternate decisions to create disagreements
  $decision = if ($idx % 2 -eq 0) { "Bail Granted" } else { "Bail Rejected" }

  $notes = if ($decision -eq "Bail Granted") {
    "Granted with conditions: passport surrender + weekly reporting. (seeded note)"
  } else {
    "Rejected due to witness intimidation risk / custodial interrogation need. (seeded note)"
  }

  $decBody = @{
    case_id = $caseId
    decision = $decision
    notes = $notes
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$API/judge/decision" -Headers @{ Authorization = "Bearer $judgeToken" } -ContentType "application/json" -Body $decBody | Out-Null
  Write-Host "Saved judge decision for case_id=$caseId -> $decision"
}

Write-Host ""
Write-Host "Done."
Write-Host "Login creds:"
Write-Host "Court Authority: $authUser / $pass"
Write-Host "Judge:         $judgeUser / $pass"