import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAudioDevices } from '@/hooks/useAudioDevices';

interface DeviceSelectorProps {
    onDeviceSelected?: (deviceId: string) => void;
    autoRequest?: boolean;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({ onDeviceSelected, autoRequest = true }) => {
    const { t } = useTranslation();
    const { 
        devices, 
        selectedDeviceId, 
        updateSelectedDevice, 
        isPermissionGranted, 
        requestPermissionsAndFetchDevices 
    } = useAudioDevices();

    useEffect(() => {
        if (autoRequest && !isPermissionGranted) {
            requestPermissionsAndFetchDevices();
        }
    }, [autoRequest, isPermissionGranted, requestPermissionsAndFetchDevices]);

    useEffect(() => {
        if (selectedDeviceId && onDeviceSelected) {
            onDeviceSelected(selectedDeviceId);
        }
    }, [selectedDeviceId, onDeviceSelected]);

    if (!isPermissionGranted && !autoRequest) {
        return (
            <div className="control-group">
                <button className="mode-btn" onClick={requestPermissionsAndFetchDevices}>
                    {t('controls.requestMic')}
                </button>
            </div>
        );
    }

    if (!isPermissionGranted) {
        return <div className="control-group"><label>{t('controls.requestMic')}...</label></div>;
    }

    return (
        <div className="control-group">
            <label htmlFor="device-select">{t('controls.inputDevice')}:</label>
            <select 
                id="device-select"
                value={selectedDeviceId || ''} 
                onChange={(e) => updateSelectedDevice(e.target.value)}
            >
                <option value="" disabled>{t('controls.selectDevice')}</option>
                {devices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.substring(0, 5)}...`}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default DeviceSelector;
