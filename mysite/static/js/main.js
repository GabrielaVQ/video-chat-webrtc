console.log('In main.js');

const IMAGE_INTERVAL_MS = 2000;

var mapPeers = {}; //Pares nuevos que se unen, no incluye el local
var intervalIds = {};

var usernameInput = document.querySelector('#username');
var btnJoin = document.querySelector('#btn-join');

var username;
var webSocket;

var localCanvas = document.getElementById("myCanvas");

function cleanFaceRectangles(video, canvas) {
    const ctx = canvas.getContext('2d');

    ctx.width = video.videoWidth;
    ctx.height = video.videoHeight;
  
    ctx.beginPath();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.stroke();
}
function drawResult(video, canvas, face, frontal) {
    const ctx = canvas.getContext('2d');
  
    ctx.width = video.videoWidth;
    ctx.height = video.videoHeight;
  
    //Cuadro para rostro
    ctx.beginPath();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "green";
    ctx.lineWidth = 5
    ctx.beginPath();
    for (const [x, y, w, h] of face) {
        ctx.rect(x, y, w, h);
    }
    ctx.stroke();

    //Frontal no frontal
    ctx.font = "30px Arial";
    if(frontal) {
        ctx.fillStyle = "green";
        ctx.fillText("Frontal", 50, 50);
    } else {
        ctx.fillStyle = "red";
        ctx.fillText("No frontal", 50, 50);
    }
}

function webSocketOnMessage(event){

    var parsedData = JSON.parse(event.data);

    var peerUsername = parsedData['peer'];
    var action = parsedData['action'];

    console.log('------');
    console.log(username, ' - ', peerUsername);
    console.log('------', action);

    var receiver_channel_name = parsedData['message']['receiver_channel_name'];

    if(username == peerUsername){
        if(action == 'frame'){
            var peerFrame = parsedData['message']['peerUsername'];
            var peerVideo = document.querySelector('#' + peerFrame + '-video');
            var peerCanvas = document.querySelector('#' + peerFrame + '-canvas');
            if(parsedData['message']['face']){
                drawResult(peerVideo, peerCanvas, parsedData['message']['face'], parsedData['message']['frontal']);
            }else{
                /* cleanFaceRectangles(peerVideo, peerCanvas); */
            }
        }
        return
    }

    if(action == 'new-peer'){
        createOfferer(peerUsername, receiver_channel_name);
        return;
    }

    if(action == 'new-offer'){
        var offer = parsedData['message']['sdp'];

        createAnswerer(offer, peerUsername, receiver_channel_name);

        return;
    }

    if(action == 'new-answer'){ console.log('MESSAGE: New answer');
        var answer = parsedData['message']['sdp'];
        var peer = mapPeers[peerUsername][0];

        peer.setRemoteDescription(answer);

        return;
    }

}

/* Inicio botón unirse a sala */
btnJoin.addEventListener('click', () => {
    username = usernameInput.value;
    console.log('username: ', username);

    if(username == ''){
        return;
    }

    usernameInput.value = '';
    usernameInput.disabled = true;
    usernameInput.classList.add('d-none');

    btnJoin.disabled = true;
    btnJoin.classList.add('d-none');

    var labelUsername = document.querySelector('#label-username');
    labelUsername.innerHTML = username;


    var loc = window.location;
    var wsStart = 'ws://';

    if(loc.protocol == 'https:'){
        wsStart = 'wss://';
    }

    var endPoint = wsStart + loc.host + loc.pathname;
    console.log('endPoint: ', endPoint);

    webSocket = new WebSocket(endPoint); //Se ejecuta función connect de consumers.py

    webSocket.addEventListener('open', (e) => {
        console.log('Connection opened para nuevo websocket.');
        
        sendSignal('new-peer', {});
    });
    webSocket.addEventListener('message', webSocketOnMessage);

    webSocket.addEventListener('close', (e) => {
        console.log('Connection closed');
    })
    
    webSocket.addEventListener('error', (e) => {
        console.log('Error ocurred');
    })
})
/* Fin botón unirse a sala */

/* Inicio acceso funcionalidades cámara local */
var localStream = new MediaStream();

const constraints = {
    audio: true,
    video: {
        width: {max: 640},
        height: {max: 480}
    }
};

const localVideo = document.querySelector('#localVideo');

const btnToggleAudio = document.querySelector('#btn-toggle-audio');
const btnToggleVideo = document.querySelector('#btn-toggle-video');

var userMedia = navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = localStream;
        localVideo.muted = true;

        var audioTracks = stream.getAudioTracks();
        var videoTracks = stream.getVideoTracks();

        audioTracks[0].enabled = true;
        videoTracks[0].enabled = true;

        btnToggleAudio.addEventListener('click', () => {
            audioTracks[0].enabled = !audioTracks[0].enabled;
            if(audioTracks[0].enabled){
                btnToggleAudio.innerHTML = 'Audio Mute';
                return;
            }
            btnToggleAudio.innerHTML = 'Audio Unmute';
        });

        btnToggleVideo.addEventListener('click', () => {
            videoTracks[0].enabled = !videoTracks[0].enabled;
            if(videoTracks[0].enabled){
                btnToggleVideo.innerHTML = 'Video Off';
                return;
            }
            btnToggleVideo.innerHTML = 'Video On';
        });
        
    })
    .catch(error => {
        console.log('Error accessing media devices.', error);
    })
/* Fin acceso funcionalidades cámara local */

/* Inicio funcionalidades chat */
var btnSendMsg = document.querySelector('#btn-send-msg');
var messageList = document.querySelector('#message-list');
var messageInput = document.querySelector('#msg');

btnSendMsg.addEventListener('click', sendMsgOnClick);

function sendMsgOnClick(){
    var message = messageInput.value;

    var li = document.createElement('li');
    li.appendChild(document.createTextNode('Me: ' + message));
    messageList.appendChild(li);

    var dataChannels = getDataChannels();

    message = username + ': ' + message;
    for(index in dataChannels){
        dataChannels[index].send(message);
    }

    messageInput.value = '';
}
/* Fin funcionalidades chat */

function sendSignal(action, message) {
    var jsonStr = JSON.stringify({
        'peer': username,
        'action': action,
        'message': message,
    });
    
    webSocket.send(jsonStr); //Se ejecuta función receive de consumers.py
}

function clearIntervalIds(peerUsername){
    clearInterval(intervalIds[peerUsername]);
    delete intervalIds[peerUsername];
}

function createOfferer(peerUsername, receiver_channel_name){
    var peer = new RTCPeerConnection(null);

    addLocalTracks(peer);

    var dc = peer.createDataChannel('channel');
    dc.addEventListener('open', () => {
        console.log('Connection opened para nuevo RTCPeer oferta');
    });

    dc.addEventListener('message', dcOnMessage); // Para mensajes del chat

    var {remoteVideo, remoteCanvas} = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo, remoteCanvas, peerUsername);

    mapPeers[peerUsername] = [peer, dc];

    peer.addEventListener('iceconnectionstatechange', ()  => {
        var iceConnectionState = peer.iceConnectionState;

        if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];

            if(iceConnectionState != 'closed'){
                peer.close();
            }

            removeVideo(remoteVideo);

            if(username == 'admin'){
                clearIntervalIds(peerUsername);
            }
        }
    });

    peer.addEventListener('icecandidate', (event)  => {

        if(event.candidate){
            //console.log('New ice candidate', JSON.stringify(peer.localDescription));
            console.log('New ice candidate');
            return;
        }

        console.log('Se enviará sendSignal NewOffer');
        sendSignal('new-offer', {
            'sdp': peer.localDescription,
            'receiver_channel_name': receiver_channel_name
        });
    });

    peer.createOffer()
        .then(o => peer.setLocalDescription(o))
        .then(() => {
            console.log('Local description set successfully');
    });
}

function createAnswerer(offer, peerUsername, receiver_channel_name){
    var peer = new RTCPeerConnection(null);

    addLocalTracks(peer);

    var {remoteVideo, remoteCanvas} = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo, remoteCanvas, peerUsername);

    peer.addEventListener('datachannel', e => {
        peer.dc = e.channel;
        peer.dc.addEventListener('open', () => {
            console.log('Connection opened para RTCPeer respuesta');
        });

        peer.dc.addEventListener('message', dcOnMessage); // Para enviar mensajes por chat

        mapPeers[peerUsername] = [peer, peer.dc];
    });    

    peer.addEventListener('iceconnectionstatechange', ()  => {
        var iceConnectionState = peer.iceConnectionState;

        if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];

            if(iceConnectionState != 'closed'){
                peer.close();
            }

            removeVideo(remoteVideo);

            if(username == 'admin'){
                clearIntervalIds(peerUsername);
            }
        }
    });

    peer.addEventListener('icecandidate', (event)  => {
        if(event.candidate){
            //console.log('New ice candidate', JSON.stringify(peer.localDescription));
            return;
        }

        console.log('Se enviará sendSignal NewAnswer');
        sendSignal('new-answer', {
            'sdp': peer.localDescription,
            'receiver_channel_name': receiver_channel_name
        });
    });

    peer.setRemoteDescription(offer)
        .then(() => {
            console.log('Remote descrption set successfully for %s', peerUsername);
            return peer.createAnswer();
        })
        .then(a => {
            console.log('Answer created');
            peer.setLocalDescription(a);
    });
}

function addLocalTracks(peer){
    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });
    return;
}

function dcOnMessage(event){
    var message = event.data;

    var li = document.createElement('li');
    li.appendChild(document.createTextNode(message));
    messageList.appendChild(li);
}

function createVideo(peerUsername){
    var videoContainer = document.querySelector('#video-container');

    var remoteVideo = document.createElement('video');
    remoteVideo.id = peerUsername + '-video';
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;

    var remoteCanvas = document.createElement('canvas');
    remoteCanvas.id = peerUsername + '-canvas';
    remoteCanvas.classList.add('position-absolute','top-0','left-0');

    var videoWrapper = document.createElement(('div'));
    videoWrapper.classList.add('position-relative');

    videoContainer.appendChild(videoWrapper);
    videoWrapper.appendChild(remoteVideo);
    videoWrapper.appendChild(remoteCanvas);

    return {remoteVideo, remoteCanvas};
}

function setOnTrack(peer, remoteVideo, remoteCanvas, peerUsername){
    var remoteStream = new MediaStream();

    remoteVideo.srcObject = remoteStream;

    peer.addEventListener('track', async (event) => {
        remoteStream.addTrack(event.track, remoteStream);
                
        if(username == 'admin' && event.track.kind == 'video'){
            intervalIds[peerUsername] = setInterval(() => {
                remoteCanvas.width = remoteVideo.videoWidth;
                remoteCanvas.height = remoteVideo.videoHeight;
                if(remoteStream.getVideoTracks()[0].enabled){
                    // Create a virtual canvas to draw current video image
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = remoteVideo.videoWidth;
                    canvas.height = remoteVideo.videoHeight;
                    ctx.drawImage(remoteVideo, 0, 0);
                            
                    sendSignal('frame', {
                        'image': canvas.toDataURL().split(',')[1],
                        'peerUsername': peerUsername
                    });
                }
            }, IMAGE_INTERVAL_MS);
            
        }
    })
    
}

function removeVideo(video){
    var videoWrapper = video.parentNode;

    videoWrapper.parentNode.removeChild(videoWrapper);
}

function getDataChannels(){
    var dataChannels = [];
    for (peerUsername in mapPeers) {
        var dataChannel = mapPeers[peerUsername][1];
        dataChannels.push(dataChannel);
    }
    return dataChannels;
}