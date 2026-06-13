import requests

url = "http://localhost:8000/api/register"
data = {
    "username": "kirubasankar068@gmail.com",
    "password": "password123"
}

try:
    response = requests.post(url, json=data)
    print("Status Code:", response.status_code)
    print("Response JSON:", response.json())
except Exception as e:
    print("Error:", e)
