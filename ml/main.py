import pathlib
from bson.json_util import loads
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import tensorflow_docs as tfdocs
import tensorflow_docs.plots
import tensorflow_docs.modeling

with open('data.json', 'r') as f:
    raw_dataset = pd.DataFrame(loads(f.read()))


dataset = raw_dataset.copy()


dataset = dataset.drop('_id', 1)
dataset = dataset.drop('start', 1)
dataset = dataset.drop('end', 1)

# temp
#dataset = dataset.drop('employee', 1)
#dataset = dataset.drop('dayOfWeek', 1)
dataset = dataset.drop('endHour', 1)
#dataset = dataset.drop('startHour', 1)
#dataset = dataset.drop('weekHours', 1)
#dataset = dataset.drop('duration', 1)


# shouldn't change anything
#dataset['weekHours'] = 40 - dataset['weekHours']


dataset['dayOfWeek'] = dataset['dayOfWeek'].map({i+1: s for i, s in enumerate(['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri'])})
dataset = pd.get_dummies(dataset, prefix='', prefix_sep='')

print(list(dataset))
#print(dataset.tail())

train_dataset = dataset.sample(frac=0.8,random_state=0)
test_dataset = dataset.drop(train_dataset.index)

sns.pairplot(train_dataset[['startHour', 'duration', 'weekHours']], diag_kind='kde')
plt.show()

train_stats = train_dataset.describe()
train_stats.pop('duration')
train_stats = train_stats.transpose()


train_labels = train_dataset.pop('duration')
test_labels = test_dataset.pop('duration')

def norm(x):
    return (x - train_stats['mean']) / train_stats['std']

def denorm(y):
    return y * train_stats['std'] + train_stats['mean']


normed_train_data = norm(train_dataset)
normed_test_data = norm(test_dataset)

print(normed_train_data.tail())
#print(train_dataset.keys())

def build_model():
    model = keras.Sequential([
      layers.Dense(64, activation='relu', input_shape=[len(train_dataset.keys())]),
      layers.Dense(64, activation='relu'),
      layers.Dense(1)
    ])
    
    optimizer = tf.keras.optimizers.RMSprop(0.001)
    
    model.compile(loss='mse',
                  optimizer=optimizer,
                  metrics=['mae', 'mse'])
    return model

model = build_model()

EPOCHS = 1000

# The patience parameter is the amount of epochs to check for improvement
early_stop = keras.callbacks.EarlyStopping(monitor='val_loss', patience=10)

history = model.fit(
    normed_train_data,
    train_labels,
    epochs=EPOCHS,
    validation_split = 0.2,
    verbose=0,
    callbacks=[early_stop, tfdocs.modeling.EpochDots()],
)

#hist = pd.DataFrame(history.history)
#hist['epoch'] = history.epoch
#print(hist.tail())

example_batch = normed_train_data[:10]
example_result = model.predict(example_batch)
print(example_result)

#print(model.summary())

#plotter = tfdocs.plots.HistoryPlotter(smoothing_std=2)
#plotter.plot({'Basic': history}, metric = "mean_absolute_error")
#plt.ylim([0, 2])
#plt.ylabel('MAE [startHour]')
#
#plt.show()

loss, mae, mse = model.evaluate(normed_test_data, test_labels, verbose=2)
print("Testing set Mean Abs Error: {:5.2f} hours (duration)".format(mae))


test_predictions = model.predict(normed_test_data)
test_predictions = test_predictions.flatten()

a = plt.axes(aspect='equal')
plt.scatter(test_labels, test_predictions)
plt.xlabel('True Values [hours]')
plt.ylabel('Predictions [hours]')
lims = [0, 20]
plt.xlim(lims)
plt.ylim(lims)
_ = plt.plot(lims, lims)

#error = test_predictions - test_labels
#plt.hist(error, bins = 25)
#plt.xlabel("Prediction Error [hours]")
#_ = plt.ylabel("Count")
plt.show()
