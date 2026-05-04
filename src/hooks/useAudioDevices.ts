import { useState, useEffect, useCallback } from 'react';

export const useAudioDevices = () => {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [isPermissionGranted, setIsPermissionGranted] = useState(false);

    useEffect(() => {
        const savedDevice = localStorage.getItem('audio_device_id');
        if (savedDevice) {
            setSelectedDeviceId(savedDevice);
        }
    }, []);

    const updateSelectedDevice = useCallback((deviceId: string) => {
        setSelectedDeviceId(deviceId);
        localStorage.setItem('audio_device_id', deviceId);
    }, []);

    const requestPermissionsAndFetchDevices = useCallback(async () => {
        try {
            // Request permissions first
            await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsPermissionGranted(true);

            // Fetch devices
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const inputs = allDevices.filter(device => device.kind === 'audioinput');
            setDevices(inputs);

            // If a saved device exists but is not in the list, or no device is selected, select the first one (or default)
            const savedDevice = localStorage.getItem('audio_device_id');
            const deviceExists = inputs.some(d => d.deviceId === savedDevice);
            
            if (savedDevice && deviceExists) {
                setSelectedDeviceId(savedDevice);
            } else if (inputs.length > 0) {
                // If there's a default, use it. Otherwise use the first one.
                const defaultDevice = inputs.find(d => d.deviceId === 'default') || inputs[0];
                updateSelectedDevice(defaultDevice.deviceId);
            }

        } catch (err) {
            console.error("Error fetching audio devices or permissions denied:", err);
            setIsPermissionGranted(false);
        }
    }, [updateSelectedDevice]);

    return {
        devices,
        selectedDeviceId,
        updateSelectedDevice,
        isPermissionGranted,
        requestPermissionsAndFetchDevices
    };
};
