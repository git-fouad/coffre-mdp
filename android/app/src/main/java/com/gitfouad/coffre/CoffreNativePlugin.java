package com.gitfouad.coffre;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fonctions natives de Coffre.
 *
 * Empreinte digitale : la clé du coffre est chiffrée par une clé AES du Keystore Android
 * (matériel sécurisé) qui n'est utilisable qu'après une authentification biométrique forte,
 * et qui est détruite si les empreintes du téléphone changent.
 *
 * Presse-papier : copie marquée « sensible » (masquée dans l'aperçu d'Android 13+)
 * et effacement automatique après le délai choisi.
 */
@CapacitorPlugin(name = "CoffreNative")
public class CoffreNativePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "coffre_biometric_key";
    private static final String PREFS = "coffre_biometric";
    private static final String PREF_IV = "iv";
    private static final String PREF_CT = "ct";
    private static final String CLIP_LABEL = "Coffre";
    private static final String EXTRA_IS_SENSITIVE = "android.content.extra.IS_SENSITIVE";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable clearTask;

    private interface CipherAction {
        void run(Cipher cipher) throws Exception;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- Biométrie

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        int can = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject result = new JSObject();
        result.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("enabled", isEnabled());
        result.put("reason", reasonFor(can));
        call.resolve(result);
    }

    @PluginMethod
    public void biometricEnable(final PluginCall call) {
        final String secret = call.getString("secret");
        if (secret == null || secret.isEmpty()) {
            call.reject("Secret manquant", "INVALID");
            return;
        }
        final Cipher cipher;
        try {
            clearAll();
            SecretKey key = createKey();
            cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
        } catch (Exception e) {
            call.reject("Impossible de préparer la clé : " + e.getMessage(), "KEY_ERROR", e);
            return;
        }
        authenticate(call, cipher, c -> {
            byte[] ct = c.doFinal(secret.getBytes(StandardCharsets.UTF_8));
            prefs().edit()
                .putString(PREF_IV, Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                .putString(PREF_CT, Base64.encodeToString(ct, Base64.NO_WRAP))
                .apply();
            call.resolve();
        });
    }

    @PluginMethod
    public void biometricUnlock(final PluginCall call) {
        SharedPreferences p = prefs();
        String iv = p.getString(PREF_IV, null);
        String ct = p.getString(PREF_CT, null);
        if (iv == null || ct == null) {
            call.reject("Empreinte non activée", "NOT_ENABLED");
            return;
        }
        final byte[] ctBytes = Base64.decode(ct, Base64.NO_WRAP);
        final Cipher cipher;
        try {
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            SecretKey key = (SecretKey) ks.getKey(KEY_ALIAS, null);
            if (key == null) {
                clearAll();
                call.reject("Clé d'empreinte introuvable", "INVALIDATED");
                return;
            }
            cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
        } catch (KeyPermanentlyInvalidatedException e) {
            clearAll();
            call.reject("Les empreintes du téléphone ont changé", "INVALIDATED", e);
            return;
        } catch (Exception e) {
            call.reject("Impossible d'utiliser la clé : " + e.getMessage(), "KEY_ERROR", e);
            return;
        }
        authenticate(call, cipher, c -> {
            byte[] pt = c.doFinal(ctBytes);
            JSObject result = new JSObject();
            result.put("secret", new String(pt, StandardCharsets.UTF_8));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void biometricDisable(PluginCall call) {
        clearAll();
        call.resolve();
    }

    private boolean isEnabled() {
        if (!prefs().contains(PREF_CT)) return false;
        try {
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            return ks.containsAlias(KEY_ALIAS);
        } catch (Exception e) {
            return false;
        }
    }

    private SecretKey createKey() throws Exception {
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Authentification biométrique forte exigée à chaque utilisation de la clé.
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(builder.build());
        return generator.generateKey();
    }

    private void clearAll() {
        prefs().edit().clear().apply();
        try {
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // rien à supprimer
        }
    }

    private void authenticate(final PluginCall call, final Cipher cipher, final CipherAction action) {
        final FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("Appli non prête", "BIOMETRIC_ERROR");
            return;
        }
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                        Cipher authorized = crypto != null ? crypto.getCipher() : null;
                        if (authorized == null) {
                            call.reject("Authentification sans clé", "KEY_ERROR");
                            return;
                        }
                        try {
                            action.run(authorized);
                        } catch (Exception e) {
                            call.reject("Échec du chiffrement : " + e.getMessage(), "KEY_ERROR", e);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence message) {
                        String errorCode;
                        if (code == BiometricPrompt.ERROR_USER_CANCELED
                            || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                            || code == BiometricPrompt.ERROR_CANCELED) {
                            errorCode = "CANCELLED";
                        } else if (code == BiometricPrompt.ERROR_LOCKOUT
                            || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                            errorCode = "LOCKOUT";
                        } else {
                            errorCode = "BIOMETRIC_ERROR";
                        }
                        call.reject(message.toString(), errorCode);
                    }
                    // onAuthenticationFailed : doigt non reconnu, la fenêtre reste ouverte pour réessayer.
                }
            );
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title", "Coffre"))
                .setSubtitle(call.getString("subtitle", null))
                .setNegativeButtonText(call.getString("negative", "Annuler"))
                .setAllowedAuthenticators(AUTHENTICATORS)
                .setConfirmationRequired(false)
                .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }

    private String reasonFor(int code) {
        switch (code) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "Aucune empreinte n'est enregistrée sur ce téléphone.";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "Ce téléphone n'a pas de capteur compatible.";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "Le capteur est indisponible pour le moment.";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "Une mise à jour de sécurité du téléphone est nécessaire.";
            default:
                return "Biométrie non disponible sur ce téléphone.";
        }
    }

    // ------------------------------------------------------------ Presse-papier

    @PluginMethod
    public void copySecret(final PluginCall call) {
        final String text = call.getString("text", "");
        final int clearAfter = call.getInt("clearAfterSeconds", 30);
        handler.post(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText(CLIP_LABEL, text);
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean(EXTRA_IS_SENSITIVE, true);
                clip.getDescription().setExtras(extras);
                cm.setPrimaryClip(clip);
                scheduleClear(clearAfter);
                call.resolve();
            } catch (Exception e) {
                call.reject("Copie impossible : " + e.getMessage(), "CLIPBOARD_ERROR", e);
            }
        });
    }

    @PluginMethod
    public void clearClipboard(final PluginCall call) {
        handler.post(() -> {
            clearIfOurs();
            call.resolve();
        });
    }

    private void scheduleClear(int seconds) {
        if (clearTask != null) handler.removeCallbacks(clearTask);
        if (seconds <= 0) return;
        clearTask = this::clearIfOurs;
        handler.postDelayed(clearTask, seconds * 1000L);
    }

    private void clearIfOurs() {
        try {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            ClipDescription description = cm.getPrimaryClipDescription();
            if (description != null) {
                CharSequence label = description.getLabel();
                // L'utilisateur a copié autre chose depuis : on n'y touche pas.
                if (label == null || !CLIP_LABEL.contentEquals(label)) return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                cm.clearPrimaryClip();
            } else {
                cm.setPrimaryClip(ClipData.newPlainText("", ""));
            }
        } catch (Exception ignored) {
            // presse-papier inaccessible : Android l'effacera lui-même plus tard
        }
    }
}
