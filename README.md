# AI for Fairness in Judicial Decision Making

An AI-powered decision-support system designed to assist judges in making bail decisions while promoting transparency, explainability, and fairness.

The system predicts whether bail should be granted or rejected based on case information and provides an explanation of the prediction. It also includes an audit mode that compares AI recommendations with judge decisions and analyzes potential disparities across demographic groups.


##  Overview

Artificial intelligence is increasingly being explored in legal decision-making. However, AI systems used in sensitive domains such as the justice system need to be carefully designed to support human decision-makers while addressing issues such as transparency, explainability, and potential bias.

This project explores how AI can be used to support bail decision-making while keeping the final authority with a human judge.

The system provides two main modes:

###  AI Judge Mode

Allows a judge to enter information about a case and receive:

- Bail Granted / Bail Rejected prediction
- Prediction confidence
- SHAP-based explanation of the prediction
- Relevant case information used by the model

###  Audit Mode

Allows authorized users to analyze decision-making patterns by:

- Comparing judge decisions with AI recommendations
- Examining differences across demographic groups
- Identifying potential disparities in decisions
- Providing statistical insights into decision patterns


##  Key Features

- AI-based bail decision prediction
- Explainable AI using SHAP
- Natural language processing of legal case text
- Structured case information processing
- Judge vs AI decision comparison
- Fairness and disparity analysis
- Role-based authentication
- JWT-based authentication
- SQLite database
- Web-based user interface
- FastAPI backend
- Next.js frontend



