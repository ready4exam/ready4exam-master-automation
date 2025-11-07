name: "Create or Update Class Repo (Front-End Builder)"

on:
  workflow_dispatch:
    inputs:
      class:
        description: "Enter class number (5–12)"
        required: true
        default: "11"

jobs:
  build-repo:
    runs-on: ubuntu-latest

    # --- GLOBAL ENVIRONMENT VARIABLES ---
    # These variables are accessible to all steps in this job.
    env:
      # Non-secret, static configuration value
      OWNER: ready4exam 
      
      # Workflow Input
      CLASS: ${{ github.event.inputs.class }}

      # Secrets accessed via the ${{ secrets.<NAME> }} context
      PERSONAL_ACCESS_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

    steps:
      - name: 🧩 Checkout master automation repo
        uses: actions/checkout@v4

      - name: 🧠 Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: 📦 Install dependencies
        run: npm install

      - name: ⚙️ Run Class Repo Builder Script
        run: |
          echo "⚙️ Running createClassRepo.js for class=${{ github.event.inputs.class }}"
          # Note: The script uses 'OWNER' from env, which is set to 'ready4exam' above.
          node createClassRepo.js
