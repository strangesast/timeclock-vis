import x

'''
http://amgsoftware.co/html/ebff4b13-b296-f58d-e83a-ede0ba3cd20d.htm
'''
mlrpclib


from datetime import datetime, date
import sys

# Using Basic Authentication because xmlrpclib doesn't support cookies
uri = 'http://administrator:password@localhost:3003/API/Timecard.ashx'
proxy = xmlrpclib.ServerProxy(uri)

employeeSortedList = sorted([(e['Id'], e) for e in proxy.GetAllEmployeesShort()], key=lambda emp: emp[1]['Code'])
employees = dict(employeeSortedList)
categories = dict([(c['Id'], c) for c in proxy.GetCategories([])])
jobs = dict([(c['Id'], c) for c in proxy.GetJobs([])])
timeCards = proxy.GetTimecards([e[0] for e in employeeSortedList], date(2014, 11, 1), date(2014,11,30), False);

print "!TIMERHDR\tVER\tREL\tCOMPANYNAME\tIMPORTEDBEFORE\tFROMTIMER\tCOMPANYCREATETIME"
print "TIMERHDR\t6\t0\tDECN Inc.\tN\tY\tABC"
print "!TIMEACT\tDATE\tEMP\tPITEM\tDURATION\tNOTE\tXFERTOPAYROLL\tBILLINGSTATUS"

durations = {}
durationsList = []
format = "TIMEACT\t%s\t%s\t%s\t%%.2f\t \tY\t0"

categoryExportCodes = ['RegNone', 'OT1None', 'OT2None', 'OT3None']
timeCardWorkTimes = ['Reg', 'OT1', 'OT2', 'OT3']

for empl in timeCards:
    for tc in empl['Timecards']:
        category = categories[tc['CategoryId']] if 'CategoryId' in tc else None
        if category == None or (not category['CanExport']):
            continue

        dateStr = datetime.strftime(datetime.strptime(tc['Date'].value, '%Y%m%dT%H:%M:%S'), '%m/%d/%Y')
        employee = employees[empl['EmployeeId']]
        employeeName = '"%s, %s %s"' % (employee['LastName'], employee['Name'], employee['MiddleName'])
        pItem = categories[tc['CategoryId']]['Name']
        jobStr = jobs[tc['JobId']]['Name'] if 'JobId' in tc else ''

        if tc['CategoryId'] == 16: # Work:
            for i in range(3):
                if tc[timeCardWorkTimes[i]] == 0:
                    continue

                pItem = jobStr + ' ' + category[categoryExportCodes[i]]
                key = format % (dateStr, employeeName, pItem)
                if not key in durations:
                    durationsList.append(key);
                    durations[key] = 0

                durations[key] += tc[timeCardWorkTimes[i]];
        else:
            key = format % (dateStr, employeeName, jobStr + ' ' + pItem)
            if not key in durations:
                durationsList.append(key);
                durations[key] = 0

            if category['Type'] == 0: # Hours:
                durations[key] += tc['Reg'] + tc['OT1'] + tc['OT2'] + tc['OT3'] + tc['Unpaid']
            else:
                durations[key] += tc['Money']

for key in durationsList:
    print key % (durations[key], )
    
    
