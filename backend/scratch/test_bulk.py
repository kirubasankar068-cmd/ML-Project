import urllib.request
import json
import urllib.error

def run_test():
    try:
        # 1. Login
        login_data = json.dumps({'username': 'admin', 'password': 'admin123'}).encode('utf-8')
        req = urllib.request.Request('http://127.0.0.1:8000/api/login', data=login_data, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        token_info = json.loads(res.read().decode())
        token = token_info['access_token']
        print('Logged in successfully. Token:', token[:15] + '...')

        # 2. Prepare CSV content
        csv_content = 'title,description,component,severity,affected_users,is_reproducible,reported_by\n'
        csv_content += 'Database connection pool exhausted,The pool size has been exhausted.,database,critical,919,True,alice@example.com\n'
        csv_content += 'Payment gateway returns 503,The Stripe API is down.,payments,critical,100,True,bob@example.com\n'

        # 3. Upload file to new predict/bulk endpoint
        boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
        body = []
        body.append(f'--{boundary}'.encode('ascii'))
        body.append(b'Content-Disposition: form-data; name="file"; filename="test.csv"')
        body.append(b'Content-Type: text/csv')
        body.append(b'')
        body.append(csv_content.encode('utf-8'))
        body.append(f'--{boundary}'.encode('ascii'))
        body.append(b'Content-Disposition: form-data; name="cross_check"')
        body.append(b'')
        body.append(b'false')
        body.append(f'--{boundary}--'.encode('ascii'))
        body.append(b'')
        payload = b'\r\n'.join(body)

        headers = {
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Authorization': f'Bearer {token}'
        }
        req = urllib.request.Request('http://127.0.0.1:8000/api/predict/bulk', data=payload, headers=headers)
        res = urllib.request.urlopen(req)
        print('Response status:', res.status)
        response_body = res.read().decode()
        print('Response body snippet:', response_body[:1000])
        parsed = json.loads(response_body)
        assert parsed["success"] is True
        assert parsed["total"] == 2
        assert len(parsed["results"]) == 2
        assert parsed["results"][0]["priority"] == "Critical"
        print("TEST PASSED successfully!")
    except urllib.error.HTTPError as e:
        print('HTTP Error:', e.code, e.reason)
        print('HTTP Response body:', e.read().decode())
    except Exception as e:
        print('Error:', str(e))

if __name__ == '__main__':
    run_test()
