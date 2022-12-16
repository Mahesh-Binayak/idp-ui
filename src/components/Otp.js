import { useState } from "react";
import { useTranslation } from "react-i18next";
import OtpGet from "./OtpGet";
import OtpVerify from "./OtpVerify";

const OTPStatusEnum = {
  getOtp: "GETOTP",
  verifyOtp: "VERIFYOTP",
};

export default function Otp({
  param,
  authService,
  localStorageService,
  i18nKeyPrefix = "otp",
}) {
  const { t } = useTranslation("translation", { keyPrefix: i18nKeyPrefix });

  const [otpStatus, setOtpStatus] = useState(OTPStatusEnum.getOtp);
  const [otpResponse, setOtpResponse] = useState("");
  const [vid, setVid] = useState("");

  const onOtpSent = async (vid, response) => {
    setOtpResponse(response);
    setVid(vid);
    setOtpStatus(OTPStatusEnum.verifyOtp);
  };

  return (
    <>
      <div className="grid grid-cols-6 items-center">
        {otpStatus === OTPStatusEnum.verifyOtp && (
          <div className="h-6 items-center text-center flex items-start">
            <button
              onClick={() => {
                setOtpStatus(OTPStatusEnum.getOtp);
              }}
              className="text-sky-600 text-2xl font-semibold justify-left"
            >
              &#8701;
            </button>
          </div>
        )}
        <div className="h-6 flex justify-center col-start-2 col-span-4">
          <h1 className="text-center text-sky-600 font-semibold">
            {t("sign_in_with_otp")}
          </h1>
        </div>
      </div>

      {otpStatus === OTPStatusEnum.getOtp && (
        <OtpGet
          param={param}
          authService={authService}
          localStorageService={localStorageService}
          onOtpSent={onOtpSent}
        />
      )}

      {otpStatus === OTPStatusEnum.verifyOtp && (
        <OtpVerify
          param={param}
          otpResponse={otpResponse}
          vid={vid}
          authService={authService}
          localStorageService={localStorageService}
        />
      )}
    </>
  );
}
