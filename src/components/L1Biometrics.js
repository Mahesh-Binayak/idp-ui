import React, { useEffect } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingIndicator from "../common/LoadingIndicator";
import { challengeTypes } from "../constants/clientConstants";
import { LoadingStates as states } from "../constants/states";
import InputWithImage from "./InputWithImage";
import Select from "react-select";
import ErrorIndicator from "../common/ErrorIndicator";
import { useTranslation } from "react-i18next";

let fieldsState = {};
const host = "http://127.0.0.1";

const modalityIconPath = {
  Face: "images/Sign in with face.png",
  Finger: "images/Sign in with fingerprint.png",
  Iris: "images/Sign in with Iris.png",
};

export default function L1Biometrics({
  param,
  authService,
  localStorageService,
  cryptoService,
  sbiService,
  i18nKeyPrefix = "l1Biometrics",
}) {
  const { t } = useTranslation("translation", { keyPrefix: i18nKeyPrefix });

  const inputFields = param.inputFields;

  const { encodeBase64 } = { ...cryptoService };
  const { capture_Auth, mosipdisc_DiscoverDevicesAsync } = { ...sbiService };
  const { post_AuthenticateUser } = { ...authService };
  const { getDeviceInfos, getTransactionId, storeTransactionId } = {
    ...localStorageService,
  };

  inputFields.forEach((field) => (fieldsState["sbi_" + field.id] = ""));
  const [loginState, setLoginState] = useState(fieldsState);
  const [status, setStatus] = useState({
    state: states.LOADED,
    msg: "",
  });

  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const [modalityDevices, setModalityDevices] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // handle onChange event of the dropdown
  const handleDeviceChange = (device) => {
    setSelectedDevice(device);
  };

  const handleInputChange = (e) => {
    setLoginState({ ...loginState, [e.target.id]: e.target.value });
  };

  const submitHandler = (e) => {
    e.preventDefault();
    startCapture();
  };

  const startCapture = async () => {
    setError(null);

    let transactionId = getTransactionId();
    let vid = loginState["sbi_mosip-vid"];

    if (selectedDevice === null) {
      setError({
        errorCode: "device_not_found_msg",
      });
      return;
    }

    let biometricResponse = null;

    try {
      setStatus({
        state: states.AUTHENTICATING,
        msg: t("capture_initiated_msg", {
          modality: t(selectedDevice.type),
          deviceModel: selectedDevice.model,
        }),
      });

      biometricResponse = await capture_Auth(
        host,
        selectedDevice.port,
        transactionId,
        selectedDevice.specVersion,
        selectedDevice.type,
        selectedDevice.deviceId
      );

      let { errorCode, defaultMsg } =
        validateBiometricResponse(biometricResponse);

      setStatus({ state: states.LOADED, msg: "" });

      if (errorCode !== null) {
        setError({
          prefix: t("biometric_capture_failed_msg"),
          errorCode: errorCode,
          defaultMsg: defaultMsg,
        });
        return;
      }
    } catch (error) {
      setError({
        prefix: t("biometric_capture_failed_msg"),
        errorCode: error.message,
      });
      return;
    }

    try {
      await Authenticate(
        transactionId,
        vid,
        await encodeBase64(biometricResponse["biometrics"])
      );
    } catch (error) {
      setError({
        prefix: t("authentication_failed_msg"),
        errorCode: error.message,
      });
    }
  };

  /**
   *
   * @param {*} response is the SBI capture response
   * @returns first errorCode with error info, or null errorCode for no error
   */
  const validateBiometricResponse = (response) => {
    if (
      response === null ||
      response["biometrics"] === null ||
      response["biometrics"].length === 0
    ) {
      return { errorCode: "no_response_msg", defaultMsg: null };
    }

    let biometrics = response["biometrics"];

    for (let i = 0; i < biometrics.length; i++) {
      let error = biometrics[i]["error"];
      if (error !== null && error.errorCode !== "0") {
        return { errorCode: error.errorCode, defaultMsg: error.errorInfo };
      }
    }
    return { errorCode: null, defaultMsg: null };
  };

  const Authenticate = async (transactionId, uin, bioValue) => {
    let challengeType = challengeTypes.bio;
    let challenge = bioValue;

    let challengeList = [
      {
        authFactorType: challengeType,
        challenge: challenge,
      },
    ];

    setStatus({
      state: states.AUTHENTICATING,
      msg: t("authenticating_msg"),
    });

    const authenticateResponse = await post_AuthenticateUser(
      transactionId,
      uin,
      challengeList
    );

    setStatus({ state: states.LOADED, msg: "" });

    const { response, errors } = authenticateResponse;

    if (errors != null && errors.length > 0) {
      setError({
        prefix: t("authentication_failed_msg"),
        errorCode: errors[0].errorCode,
        defaultMsg: errors[0].errorMessage,
      });
    } else {
      storeTransactionId(response.transactionId);
      navigate("/consent", {
        replace: true,
      });
    }
  };

  const handleScan = (e) => {
    e.preventDefault();
    scanDevices();
  };

  useEffect(() => {
    scanDevices();
  }, []);

  const scanDevices = () => {
    setError(null);
    try {
      setStatus({
        state: states.LOADING,
        msg: t("scanning_devices_msg"),
      });

      mosipdisc_DiscoverDevicesAsync(host).then(() => {
        setStatus({ state: states.LOADED, msg: "" });
        refreshDeviceList();
      });
    } catch (error) {
      setError({
        errorCode: error.message,
      });
    }
  };

  const refreshDeviceList = () => {
    let deviceInfosPortsWise = getDeviceInfos();

    if (!deviceInfosPortsWise) {
      setModalityDevices(null);
      setError({
        errorCode: "no_devices_found_msg",
      });
      return;
    }

    let modalitydevices = [];

    Object.keys(deviceInfosPortsWise).map((port) => {
      let deviceInfos = deviceInfosPortsWise[port];

      deviceInfos?.forEach((deviceInfo) => {
        let deviceDetail = {
          port: port,
          specVersion: deviceInfo.specVersion[0],
          type: deviceInfo.digitalId.type,
          deviceId: deviceInfo.deviceId,
          model: deviceInfo.digitalId.model,
          serialNo: deviceInfo.digitalId.serialNo,
          text: deviceInfo.digitalId.make + "-" + deviceInfo.digitalId.model,
          value: deviceInfo.digitalId.serialNo,
          icon: modalityIconPath[deviceInfo.digitalId.type],
        };

        modalitydevices.push(deviceDetail);
      });
    });

    setModalityDevices(modalitydevices);

    if (modalitydevices.size === 0) {
      setError({
        errorCode: "no_devices_found_msg",
      });
      return;
    }

    let selectedDevice = modalitydevices[0];
    setSelectedDevice(selectedDevice);
  };

  return (
    <>
      <h1 className="text-center text-sky-600 font-semibold">
        {t("sign_in_with_biometric")}
      </h1>
      <form className="relative mt-8 space-y-6" onSubmit={submitHandler}>
        <div className="-space-y-px">
          {inputFields.map((field) => (
            <InputWithImage
              key={"sbi_" + field.id}
              handleChange={handleInputChange}
              value={loginState["sbi_" + field.id]}
              labelText={t(field.labelText)}
              labelFor={field.labelFor}
              id={"sbi_" + field.id}
              name={field.name}
              type={field.type}
              isRequired={field.isRequired}
              placeholder={t(field.placeholder)}
              imgPath="images/photo_scan.png"
            />
          ))}
        </div>
        {status.state === states.LOADING && error === null && (
          <div>
            <LoadingIndicator size="medium" message={status.msg} />
          </div>
        )}

        {(status.state === states.LOADED ||
          status.state === states.AUTHENTICATING) &&
          modalityDevices && (
            <>
              {selectedDevice && (
                <>
                  <div className="flex flex-col justify-center w-full">
                    <label
                      htmlFor="modality_device"
                      className="block mb-2 text-xs font-medium text-gray-900 text-opacity-70"
                    >
                      {t("select_a_device")}
                    </label>
                    <Select
                      className="bg-white shadow-lg"
                      value={selectedDevice}
                      options={modalityDevices}
                      onChange={handleDeviceChange}
                      getOptionLabel={(e) => (
                        <div className="flex items-center h-7">
                          <img className="w-7" src={e.icon} />
                          <span className="ml-2 text-xs">{e.text}</span>
                        </div>
                      )}
                    />
                  </div>

                  <div className="flex justify-center">
                    <button
                      className="w-full mt-3 text-white bg-gradient-to-t from-cyan-500 to-blue-500 hover:bg-gradient-to-b font-medium rounded-lg text-sm py-2.5 text-center"
                      type="submit"
                      id={selectedDevice.type}
                    >
                      {t("scan_and_verify")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

        {error && (
          <div className="w-full">
            <ErrorIndicator
              prefix={error.prefix}
              errorCode={error.errorCode}
              defaultMsg={error.defaultMsg}
            />

            <button
              type="button"
              className="flex justify-center w-full text-gray-900 bg-white border border-gray-300 hover:bg-gray-100 font-medium rounded-lg text-sm px-5 py-2.5"
              onClick={handleScan}
            >
              {t("retry")}
            </button>
          </div>
        )}
        {status.state === states.AUTHENTICATING && error === null && (
          <div className="absolute bottom-0 left-0 bg-white bg-opacity-70 h-full w-full flex justify-center font-semibold">
            <div className="flex items-center">
              <LoadingIndicator size="medium" message={status.msg} />
            </div>
          </div>
        )}
      </form>
    </>
  );
}
