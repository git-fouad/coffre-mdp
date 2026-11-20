package com.gitfouad.coffre;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CoffreNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Interdit les captures d'écran et masque le contenu dans la liste des applis récentes.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
