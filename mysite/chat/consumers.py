import json
from channels.generic.websocket import AsyncWebsocketConsumer

import cv2
import base64
import random
import numpy as np

import onnxruntime

#Carga de clasificador de rostros frontal
cascade_classifier = cv2.CascadeClassifier()
cascade_classifier.load(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

# Carga de modelo frontal/no frontal
ort_session = onnxruntime.InferenceSession("chat/models/model.onnx", providers=['AzureExecutionProvider', 'CPUExecutionProvider'])

""" imagen = cv2.imread('chat/models/img1.jpg')
print(imagen.shape) """

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):

        print('Ejecutando consumers.py-connect')

        self.room_group_name = 'Test-Room'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):

        print('Ejecutando consumers.py-disconnect')

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        print('Disconnected!')
        
    async def receive(self, text_data):

        print('Ejecutando consumers.py-receive')

        receive_dict = json.loads(text_data)
        message = receive_dict['message'].copy()
        action = receive_dict['action']
        
        receive_dict['message']['receiver_channel_name'] = self.channel_name

        if(action == 'new-peer'):
            #Se mandará a todos los pares
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'send.sdp',
                    'receive_dict': receive_dict,
                }
            )
            return

        if(action == 'new-offer' or action == 'new-answer'):
            receiver_channel_name = message['receiver_channel_name']
            #Se mandará el mensaje al canal receptor
            await self.channel_layer.send(
                receiver_channel_name,
                {
                    'type': 'send.sdp',
                    'receive_dict': receive_dict,
                }
            )
            return
        
        if(action == 'frame'):
            receiver_channel_name = self.channel_name
            del receive_dict['message']['image']

            frameBytes = base64.b64decode(message['image'])
            frameVector = np.frombuffer(frameBytes, dtype=np.uint8)
            frameMatrix = cv2.imdecode(frameVector, 1)

            #Rostros
            frameMatrixGray = cv2.cvtColor(frameMatrix, cv2.COLOR_BGR2GRAY)
            facePoints = cascade_classifier.detectMultiScale(frameMatrixGray)
            if(len(facePoints)>0):
                receive_dict['message']['face'] = facePoints.tolist()
                for (x,y,w,h) in facePoints:
                    faceImage = frameMatrix[y:y+h,x:x+w]
                #cv2.imwrite("filename3.jpeg", faceImage)
            else:
                receive_dict['message']['face'] = None

            #Frontal o no frontal
            ort_inputs = {'input': frameMatrix.astype(np.float32)}
            ort_outs = ort_session.run(None, ort_inputs)
            receive_dict['message']['frontal'] = ort_outs[1][0].tolist()

            #Enviar resultados
            await self.channel_layer.send(
                receiver_channel_name,
                {
                    'type': 'send.sdp',
                    'receive_dict': receive_dict,
                }
            )

            return

    async def send_sdp(self, event):

        print('Ejecutando consumers.py-sendsdp')
        
        receive_dict = event['receive_dict']

        await self.send(text_data=json.dumps(receive_dict))
    