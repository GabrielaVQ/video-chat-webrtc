import json
from channels.generic.websocket import AsyncWebsocketConsumer

import asyncio

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
        message = receive_dict['message']
        action = receive_dict['action']

        if(action == 'new-offer' or action == 'new-answer'):
            receiver_channel_name = receive_dict['message']['receiver_channel_name']
            receive_dict['message']['receiver_channel_name'] = self.channel_name

            await self.channel_layer.send(
                receiver_channel_name,
                {
                    'type': 'send.sdp',
                    'receive_dict': receive_dict,
                }
            )

            return

        receive_dict['message']['receiver_channel_name'] = self.channel_name

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'send.sdp',
                'receive_dict': receive_dict,
            }
        )

    async def send_sdp(self, event):

        print('Ejecutando consumers.py-sendsdp')
        
        receive_dict = event['receive_dict']

        await self.send(text_data=json.dumps(receive_dict))
    