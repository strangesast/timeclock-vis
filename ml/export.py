PIPELINE = [
    {'$match': {'end': {'$ne': None}}},
    {'$addFields': {
        'Tstart': {'$dateToParts': {'date': '$start', 'timezone': 'America/New_York'}},
        'Tend': {'$dateToParts': {'date': '$end', 'timezone': 'America/New_York'}},
        'dow': {'$dayOfWeek': {'date': '$start', 'timezone': 'America/New_York'}},
    }},
    {'$addFields': {
        'Tstart': {'$sum': ['$Tstart.second', {'$multiply': ['$Tstart.minute', 60]}, {'$multiply': ['$Tstart.hour', 3600]}]},
        'Tend': {'$sum': ['$Tend.second', {'$multiply': ['$Tend.minute', 60]}, {'$multiply': ['$Tend.hour', 3600]}]},
    }},
    {'$addFields': {
        'Tend': {'$cond': {'if': {'$gte': ['$Tstart', '$Tend']}, 'then': {'$sum': ['$Tend', 8.64e4]}, 'else': '$Tend'}}
    }},
    {'$addFields': {
        'Tstart': {'$divide': ['$Tstart', 3600]},
        'Tend': {'$divide': ['$Tend', 3600]},
    }},
    {'$unwind': '$components'},
    {'$lookup': {
        'from': 'components',
        'localField': 'components',
        'foreignField': '_id',
        'as': 'components',
    }},
    {'$unwind': '$components'},
    {'$group': {
        '_id': '$_id',
        'root': {'$first': '$$ROOT'},
        'components': {'$push': '$components'},
    }},
    {'$addFields': {'root.components': '$components'}},
    {'$replaceRoot': {'newRoot': '$root'}},
    {'$addFields': {'duration': {'$map': {'input': '$components', 'in': {'$subtract': ['$$this.end', '$$this.start']}}}}},
    {'$addFields': {'duration': {'$sum': '$duration'}}},
    {'$addFields': {'duration': {'$divide': ['$duration', 3.6e6]}}},
    {'$sort': {'start': 1}},
    {'$addFields': {
        'weekYear': {
            'week': {'$week': {'date': '$start', 'timezone': 'America/New_York'}},
            'year': {'$year': {'date': '$start', 'timezone': 'America/New_York'}},
        }
    }},
    {'$group': {
        '_id': {'employee': '$employee', 'week': '$weekYear'},
        'shifts': {'$push': '$$ROOT'},
    }},
    {'$addFields': {
        'shiftLengths': {'$map': {'input': '$shifts', 'in': '$$this.duration'}},
    }},
    {'$addFields': {
        'shiftWeekHours': {'$reduce': {'input': '$shiftLengths', 'initialValue': [], 'in': {'$concatArrays': ['$$value', [{'$sum': [{'$arrayElemAt': ['$$value', -1]}, '$$this']}]]}}}
    }},
    {'$addFields': {
        'shiftWeekHours': {'$concatArrays': [[0], '$shiftWeekHours']},
    }},
    {'$addFields': {
        'shiftWeekHours': {'$map': {'input': '$shiftWeekHours', 'in': {'weekHours': '$$this'}}},
    }},
    {'$addFields': {
        'shifts': {'$zip': {'inputs': ['$shifts', '$shiftWeekHours']}},
    }},
    {'$addFields': {
        'shifts': {'$map': {'input': '$shifts', 'in': {'$mergeObjects': [{'$arrayElemAt': ['$$this', 0]}, {'$arrayElemAt': ['$$this', 1]}]}}}
    }},
    {'$project': {'shifts': 1}},
    {'$unwind': '$shifts'},
    {'$replaceRoot': {'newRoot': '$shifts'}},
]
