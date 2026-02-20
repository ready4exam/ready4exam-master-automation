# Ready4Exam Automation Backend

This repository contains the backend services for the Ready4Exam platform, an automated system for generating and delivering educational quizzes. It leverages a modern stack of serverless functions, AI-powered content generation, and a robust database to provide a seamless and scalable learning experience.

## Features

- **Automated Quiz Generation:** Utilizes Google's Gemini AI to generate a wide range of quiz questions, including multiple-choice, case-based, and assertion-reason questions, tailored to specific curriculum requirements.
- **Curriculum Management:** A flexible system for managing educational content, with curriculum data stored in easily updatable JavaScript modules.
- **User-Facing Quiz Engine:** A simple, intuitive frontend for students to take quizzes, with a clean interface for chapter selection and quiz-taking.
- **Supabase Integration:** Leverages Supabase for robust data storage and retrieval, managing quiz questions and user data.
- **GitHub Automation:** Integrates with GitHub Actions to automate curriculum updates and other administrative tasks.
- **Serverless Architecture:** Built on Vercel's serverless platform, ensuring high scalability and cost-effective operation.

## Architecture

The Ready4Exam platform is built on a modern, serverless architecture designed for scalability and maintainability.

- **Frontend:** The user-facing quiz engine is a simple, lightweight application built with vanilla JavaScript, HTML, and CSS. It is located in the `template/` directory.
- **Backend:** The backend is powered by Vercel serverless functions, which handle API requests for fetching quizzes, generating new questions, and managing curriculum data. These functions are located in the `api/` directory.
- **Database:** Supabase, a PostgreSQL-based database, is used for storing all quiz questions and user-related data.
- **AI-Powered Content Generation:** Google's Gemini API is used to automatically generate high-quality quiz questions based on curriculum requirements. The logic for this is in `api/gemini.js`.
- **Automation:** GitHub Actions are used to automate administrative tasks, such as updating the curriculum.

## Project Structure

```
.
├── admin/            # Admin interface for managing users and content
├── api/              # Vercel serverless functions
│   ├── fetchQuiz.js  # Fetches quiz questions from Supabase
│   ├── gemini.js     # Generates new questions using Gemini AI
│   └── ...           # Other backend services
├── scripts/          # Automation scripts
├── static_curriculum/ # Static curriculum data
├── template/         # Frontend quiz engine (HTML, CSS, JS)
└── package.json      # Project dependencies and scripts
```

## Setup

To run the frontend locally, you can serve the `template/` directory using a simple HTTP server. For example, using Python:

```bash
python -m http.server 8000
```

The backend services in the `api/` directory are designed to be deployed as Vercel serverless functions. To run them locally, you can use the Vercel CLI:

```bash
npm install -g vercel
vercel dev
```

You will also need to set up the following environment variables in a `.env` file:

- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_SERVICE_KEY`: Your Supabase service key.
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `GITHUB_TOKEN`: A GitHub personal access token with repository access.
- `GITHUB_OWNER`: The owner of the GitHub repository.

## Deployment

The backend is automatically deployed to Vercel whenever changes are pushed to the main branch. The frontend is hosted on GitHub Pages.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue to discuss your ideas.

## License

This project is licensed under the MIT License. See the `package.json` file for details.
