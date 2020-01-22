"""
spreadsheet at https://docs.google.com/spreadsheets/d/1NgocW63t7LsjkBaroOKPGJPirSmFFRTD2FNmH4jpIUw/edit#gid=1436348900
"""
import pickle
import os.path
from pprint import pprint
import configparser
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pymysql


from util import get_rpc_connection

SCOPES = ['https://www.googleapis.com/auth/spreadsheets'] # read / write

# The ID and range of a sample spreadsheet.
SPREADSHEET_ID = '1NgocW63t7LsjkBaroOKPGJPirSmFFRTD2FNmH4jpIUw'
RANGE = 'Sheet1!A1:C1'


def get_creds(creds_filename = 'credentials.json', token_filename = 'token.pickle'):
    creds = None
    if os.path.exists(token_filename):
        with open(token_filename, 'rb') as token:
            creds = pickle.load(token)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(creds_filename, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_filename, 'wb') as token:
            pickle.dump(creds, token)
    return creds

def get_service():
    creds = get_creds()
    service = build('sheets', 'v4', credentials=creds)
    return service.spreadsheets()


def get_sheet_names(sheet, sheet_id):
    result = sheet.get(spreadsheetId=sheet_id).execute()
    return [sub.get('properties').get('title') for sub in result.get('sheets', '')]


def add_sheet(sheet, sheet_id, name):
    request = {"addSheet": {"properties": {"title": name}}}
    return sheet.batchUpdate(spreadsheetId=sheet_id, body={'requests': [request]}).execute()

def update_sheet_values(sheet, sheet_id, _range, values, dimension='ROWS'):
    value_range_body = {
        "range": _range,
        "majorDimension": dimension,
        "values": values
    }
    return sheet.values().update(
        spreadsheetId=sheet_id,
        range=_range,
        valueInputOption='USER_ENTERED',
        body=value_range_body
    ).execute()


def main():
    config = configparser.ConfigParser()
    config.read('config.ini')

    proxy = get_rpc_connection(
        config['AMG'].get('HOST'),
        config['AMG'].get('PORT'),
        config['AMG'].get('PASSWORD'),
        config['AMG'].get('USERNAME'),
        )

    methods = proxy.system.listMethods();

    service = get_service()

    sheet_names = get_sheet_names(service, SPREADSHEET_ID)

    connection = pymysql.connect(
            user='root',
            password='toast',
            host='127.0.0.1',
            database='tam')
    cur = connection.cursor()

    cur.execute("select StartTime from polllog order by StartTime desc")
    poll_list = [(d[0].isoformat(), ) for d in cur.fetchall()]
    if 'polls' not in sheet_names:
        add_sheet(service, SPREADSHEET_ID, 'polls')
    update_sheet_values(service, SPREADSHEET_ID, 'polls!A:A', poll_list)

    if 'employees' not in sheet_names:
        add_sheet(service, SPREADSHEET_ID, 'employees')
    employees_list = proxy.GetAllEmployeesShort()
    update_sheet_values(service, SPREADSHEET_ID, 'employees!A:A', [[empl['FullName']] for empl in employees_list])

    result = service.values().get(spreadsheetId=SPREADSHEET_ID,
                                range=RANGE).execute()
    values = result.get('values', [])

    print(values)


if __name__ == '__main__':
    main()
