# Installing Self-Hosted GitHub Runner

These instructions describe how to set up the self-hosted GitHub Actions runner on a new machine for the `hormuz-labs/pitch` repository.

## 1. Create a folder
```bash
mkdir actions-runner && cd actions-runner
```

## 2. Download the runner package
```bash
curl -o actions-runner-linux-x64-2.334.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-x64-2.334.0.tar.gz
```

## 3. Validate the hash (Optional)
```bash
echo "048024cd2c848eb6f14d5646d56c13a4def2ae7ee3ad12122bee960c56f3d271  actions-runner-linux-x64-2.334.0.tar.gz" | shasum -a 256 -c
```

## 4. Extract the installer
```bash
tar xzf ./actions-runner-linux-x64-2.334.0.tar.gz
```

## 5. Configure the runner
```bash
./config.sh --url https://github.com/hormuz-labs/pitch --token CBWT3SDTGRNVBEWS5XECZYTKATCJS
```
*(Note: Registration tokens generally expire after 1 hour. If this token has expired, you will need to generate a new one from your GitHub repository: Settings -> Actions -> Runners -> New self-hosted runner)*

## 6. Run the runner
To run interactively:
```bash
./run.sh
```

To run in the background (as we have it configured on this machine):
```bash
nohup ./run.sh > runner.log 2>&1 &
```
